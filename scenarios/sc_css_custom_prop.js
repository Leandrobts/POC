/**
 * CENÁRIO: CSS_CUSTOM_PROPERTY_UAF
 * Superfície C++: CSSVariableReferenceValue.cpp / StyleResolver.cpp / RenderStyle.cpp
 * Risco: HIGH
 *
 * Diferença para a versão genérica:
 *   - Versão anterior usava cascata simples de 2 níveis — insuficiente
 *     para criar dependências circulares no cache de estilos.
 *   - Versão robusta cria uma cascata de 5 níveis com dependências cruzadas,
 *     força múltiplos recálculos síncronos via offsetWidth entre remoções,
 *     e usa @property (CSS Houdini) se disponível para registrar tipos
 *     com objetos C++ próprios (CSSPropertyDescriptor) que podem ser freed.
 *   - Adiciona elemento que usa var() dentro de calc() dentro de outro var()
 *     para criar cadeia de CSSVariableReferenceValue aninhados.
 *   - Testa remoção de elementos em ordem inversa da cascata (pai → filho
 *     vs filho → pai) para acionar caminhos diferentes no StyleResolver.
 */

export default {
    id:       'CSS_CUSTOM_PROPERTY_UAF',
    category: 'Rendering',
    risk:     'HIGH',
    description:
        'Cascata CSS de 5 níveis com dependências cruzadas + @property Houdini. ' +
        'var() dentro de calc() cria cadeia de CSSVariableReferenceValue aninhados. ' +
        'offsetWidth forçado entre remoções cria multiple GC cycles do StyleResolver. ' +
        'Testa remoção pai→filho e filho→pai para atingir ambos os caminhos C++.',

    setup: function() {
        this.style = document.createElement('style');
        this.style.textContent = `
            /* @property (Houdini) — cria CSSPropertyDescriptor C++ */
            @property --fuzz-base {
                syntax: '<length>';
                initial-value: 10px;
                inherits: true;
            }
            @property --fuzz-mult {
                syntax: '<number>';
                initial-value: 1;
                inherits: false;
            }

            /* Cascata de 5 níveis */
            .fuzz-l0 { --fuzz-base: 20px; --fuzz-mult: 2; }
            .fuzz-l1 { --fuzz-l1-w: calc(var(--fuzz-base) * var(--fuzz-mult)); }
            .fuzz-l2 { --fuzz-l2-w: calc(var(--fuzz-l1-w, 0px) + 5px); }
            .fuzz-l3 { --fuzz-l3-w: calc(var(--fuzz-l2-w, 0px) * 1.5); }
            .fuzz-l4 {
                width:   var(--fuzz-l3-w, 10px);
                height:  calc(var(--fuzz-l2-w, 0px) / 2);
                opacity: calc(var(--fuzz-mult, 1) / 10);
            }
        `;
        document.head.appendChild(this.style);

        // Cria hierarquia de 5 elementos
        this.levels = [];
        let parent = document.body;
        for (let i = 0; i < 5; i++) {
            const el = document.createElement('div');
            el.className = `fuzz-l${i}`;
            el.style.cssText = 'position:absolute;background:rgba(255,0,0,0.1)';
            parent.appendChild(el);
            this.levels.push(el);
            parent = el;
        }

        // Força o StyleResolver a calcular e fazer cache de toda a cascata
        this.levels.forEach(el => void el.getBoundingClientRect());
        this.initialComputedWidths = this.levels.map(el =>
            getComputedStyle(el).width
        );
    },

    trigger: function() {
        // Remoção pai→filho: remove o nível 0 primeiro
        // O StyleResolver tenta atualizar os filhos cujo contexto de herança foi freed
        this.levels[0].remove();
        // Força recálculo síncrono IMEDIATO (antes do GC) — acessa cache freed
        try { void this.levels[4].offsetWidth; } catch(e) {}

        // Muda a propriedade do nível 1 (órfão) — StyleResolver tenta propagar
        try {
            this.levels[1].style.setProperty('--fuzz-base', '999px');
            void this.levels[4].offsetWidth;
        } catch(e) {}

        // Remove o nível 4 (folha) — freed diferente do C++ (filho morreu antes)
        this.levels[4].remove();
        try { void this.levels[1].offsetWidth; } catch(e) {}
    },

    probe: [
        // Lê estilos computados dos elementos APÓS teardown
        // Valores diferentes de 'auto' ou '0px' indicam leitura de cache freed
        s => getComputedStyle(s.levels[0]).width,        // Removido — deve ser auto/0
        s => getComputedStyle(s.levels[1]).width,        // Órfão — cache de herança freed?
        s => getComputedStyle(s.levels[2]).width,
        s => getComputedStyle(s.levels[3]).width,
        s => getComputedStyle(s.levels[4]).width,        // Removido

        // Variáveis customizadas dos elementos órfãos
        s => getComputedStyle(s.levels[1]).getPropertyValue('--fuzz-base').trim(),
        s => getComputedStyle(s.levels[1]).getPropertyValue('--fuzz-mult').trim(),
        s => getComputedStyle(s.levels[2]).getPropertyValue('--fuzz-l1-w').trim(),
        s => getComputedStyle(s.levels[3]).getPropertyValue('--fuzz-l2-w').trim(),

        // Geometry dos elementos órfãos (acessa RenderObject freed)
        s => { try { return s.levels[1].offsetWidth; } catch(e) { return e.constructor.name; } },
        s => { try { return s.levels[2].getBoundingClientRect().width; } catch(e) { return e.constructor.name; } },
        s => { try { return s.levels[3].offsetHeight; } catch(e) { return e.constructor.name; } },

        // Verifica se o valor inicial mudou (stale data do cache freed)
        s => s.initialComputedWidths[4],
        s => getComputedStyle(s.levels[3]).width === s.initialComputedWidths[3] ? 'unchanged' : 'CHANGED',
    ],

    cleanup: function() {
        try { this.levels.forEach(el => el.remove()); } catch(e) {}
        try { this.style.remove(); } catch(e) {}
        this.levels = null;
        this.initialComputedWidths = null;
    }
};
