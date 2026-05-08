/**
 * CENÁRIO: DOM_EVENT_REMOVED_ELEMENT
 * Superfície C++: EventTarget.cpp / RenderObject.cpp / RenderLayerCompositor.cpp
 * Risco: MEDIUM
 *
 * Diferença para a versão genérica:
 *   - Versão anterior usava apenas 'customevent' simples — events sintéticos
 *     não ativam o caminho de layout/paint do RenderObject.
 *   - Versão robusta usa eventos que forçam ação no RenderObject:
 *     'focus'/'blur' (ativa FocusController), 'mouseenter'/'mouseleave'
 *     (ativa HitTest), 'resize' (ativa RenderLayerCompositor).
 *   - Testa elemento com compositor layer (will-change: transform) — o
 *     RenderLayer tem seu próprio ciclo de vida e pode ser freed antes
 *     do RenderObject pai.
 *   - Adiciona MutationObserver registrado antes do remove() — o callback
 *     pode disparar sobre o nó freed após o GC do executor.
 *   - Probe acessa offsetParent, scrollIntoView() e focus() pós-free.
 */

export default {
    id:       'DOM_EVENT_REMOVED_ELEMENT',
    category: 'DOM',
    risk:     'MEDIUM',
    description:
        'Múltiplos tipos de eventos disparados em elemento removido do DOM. ' +
        'Usa eventos que ativam caminhos de RenderObject: focus, mouseenter, resize. ' +
        'will-change:transform cria RenderLayer separado com ciclo de vida próprio. ' +
        'MutationObserver registrado pré-remove pode disparar sobre nó freed.',

    setup: function() {
        this.callbackLog = [];

        this.el = document.createElement('div');
        this.el.tabIndex = 0; // Necessário para eventos de foco
        this.el.style.cssText = [
            'width:100px',
            'height:100px',
            'background:#222',
            'position:absolute',
            'top:0',
            'left:0',
            // will-change força criação de RenderLayer separado no compositor
            'will-change:transform',
            'transform:translateZ(0)',
        ].join(';');

        // Listener 1: foco — ativa FocusController no C++
        this.el.addEventListener('focus', () => {
            try { this.callbackLog.push({ ev: 'focus', rect: this.el.getBoundingClientRect() }); }
            catch(e) { this.callbackLog.push({ ev: 'focus', err: e.message }); }
        });

        // Listener 2: mouseenter — ativa HitTest no C++
        this.el.addEventListener('mouseenter', () => {
            try { this.callbackLog.push({ ev: 'mouseenter', offset: this.el.offsetWidth }); }
            catch(e) { this.callbackLog.push({ ev: 'mouseenter', err: e.message }); }
        });

        // Listener 3: evento customizado acessa layout
        this.el.addEventListener('fuzz', () => {
            try {
                this.callbackLog.push({
                    ev:       'fuzz',
                    rect:     this.el.getBoundingClientRect(),
                    offset:   this.el.offsetWidth,
                    computed: getComputedStyle(this.el).transform,
                });
            } catch(e) { this.callbackLog.push({ ev: 'fuzz', err: e.message }); }
        });

        document.body.appendChild(this.el);

        // MutationObserver registrado ANTES do remove — callback pode ser chamado pós-free
        this.mutations = [];
        this.observer = new MutationObserver(records => {
            records.forEach(r => {
                try {
                    this.mutations.push({
                        type:    r.type,
                        target:  r.target?.nodeName,
                        removed: r.removedNodes?.length,
                    });
                } catch(e) { this.mutations.push({ err: e.message }); }
            });
        });
        this.observer.observe(document.body, { childList: true, subtree: true });
    },

    trigger: function() {
        // Remove elemento → destrói RenderObject e RenderLayer
        this.el.remove();
    },

    probe: [
        // Dispara eventos que acessam o RenderObject freed
        s => { s.el.dispatchEvent(new Event('fuzz')); return s.callbackLog.length; },
        s => { s.el.dispatchEvent(new FocusEvent('focus')); return s.callbackLog.length; },
        s => { s.el.dispatchEvent(new MouseEvent('mouseenter')); return s.callbackLog.length; },

        // Acesso direto ao layout do elemento freed
        s => s.el.getBoundingClientRect().width,
        s => s.el.getBoundingClientRect().height,
        s => s.el.offsetWidth,
        s => s.el.offsetHeight,
        s => s.el.clientWidth,
        s => s.el.clientHeight,
        s => s.el.scrollWidth,
        s => s.el.scrollHeight,

        // Propriedades que apontam para o RenderObject freed
        s => s.el.offsetParent,
        s => s.el.isConnected,
        s => s.el.ownerDocument,
        s => s.el.getRootNode(),
        s => s.el.parentNode,

        // Computed style — acessa StyleResolver com RenderObject freed
        s => getComputedStyle(s.el).transform,
        s => getComputedStyle(s.el).width,
        s => getComputedStyle(s.el).willChange,

        // Tenta focus() e blur() no elemento freed
        s => { try { s.el.focus(); return 'ok'; } catch(e) { return e.message; } },
        s => { try { s.el.scrollIntoView(); return 'ok'; } catch(e) { return e.message; } },

        // MutationObserver logs — qualquer erro interno indica acesso a nó freed
        s => s.mutations.length,
        s => s.mutations.some(m => m.err) ? 'MUTATION_ERROR' : 'ok',
    ],

    cleanup: function() {
        try { this.observer.disconnect(); } catch(e) {}
    }
};
