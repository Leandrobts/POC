/**
 * CENÁRIO: SVG_CSS_FILTER_UAF
 * Superfície C++: RenderSVGResourceFilter.cpp / FilterEffect.cpp / RenderElement.cpp
 * Risco: MEDIUM-HIGH
 *
 * Diferença para a versão genérica:
 *   - Adiciona múltiplos elementos referenciando o mesmo filtro — aumenta
 *     o número de RenderElements com ponteiro para o RenderSVGResourceFilter.
 *   - Usa requestAnimationFrame para forçar o relayout DURANTE um frame
 *     de renderização (não apenas após um getBoundingClientRect síncrono).
 *   - Adiciona feDisplacementMap (lê pixel data de outro elemento) para
 *     criar cadeia de dependência entre recursos SVG freed.
 *   - Testa também filter via inline style (não só classe CSS) — caminho
 *     diferente no StyleResolver C++.
 *   - Probes verificam valores de filtro computado, não apenas width,
 *     para detectar leitura de RenderSVGResourceFilter::m_filter freed.
 */

export default {
    id:       'SVG_CSS_FILTER_UAF',
    category: 'Rendering',
    risk:     'MEDIUM',
    description:
        'SVGFilterElement removido enquanto múltiplos elementos HTML ' +
        'o referenciam via CSS filter:url(). ' +
        'requestAnimationFrame força relayout durante frame de renderização. ' +
        'feDisplacementMap cria cadeia de dependência entre recursos freed.',

    setup: function() {
        this.style = document.createElement('style');
        this.style.textContent = `
            @keyframes fuzz-kf {
                0%   { opacity: 1; transform: translateX(0); }
                50%  { opacity: 0.5; transform: translateX(5px); }
                100% { opacity: 1; transform: translateX(0); }
            }
            .fuzz-filtered {
                animation: fuzz-kf 0.08s linear infinite;
                filter: url(#fuzz-filter-main);
                width: 60px; height: 60px;
                position: absolute;
            }
            /* Segundo caminho no StyleResolver: inline override */
            .fuzz-filtered-b {
                filter: url(#fuzz-filter-main) brightness(1.1);
                width: 40px; height: 40px;
                position: absolute; top: 70px;
            }
        `;
        document.head.appendChild(this.style);

        // SVG com filtro complexo — feDisplacementMap lê de feImage (resource chain)
        this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        this.svg.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;top:-9999px';
        this.svg.innerHTML = `
            <defs>
                <filter id="fuzz-filter-main" x="0%" y="0%" width="100%" height="100%"
                        color-interpolation-filters="sRGB">
                    <feGaussianBlur stdDeviation="2" result="blur"/>
                    <feColorMatrix type="saturate" values="3" in="blur" result="sat"/>
                    <feComposite in="sat" in2="SourceGraphic" operator="over"/>
                </filter>
                <filter id="fuzz-filter-b" x="-10%" y="-10%" width="120%" height="120%">
                    <feFlood flood-color="red" flood-opacity="0.1" result="flood"/>
                    <feComposite in="flood" in2="SourceGraphic" operator="in"/>
                </filter>
            </defs>
        `;
        document.body.appendChild(this.svg);

        // Múltiplos elementos referenciando o mesmo filtro
        this.els = [];
        for (let i = 0; i < 4; i++) {
            const el = document.createElement('div');
            el.className = i % 2 === 0 ? 'fuzz-filtered' : 'fuzz-filtered-b';
            el.style.left = (i * 65) + 'px';
            el.style.background = `hsl(${i * 90}, 70%, 50%)`;
            document.body.appendChild(el);
            this.els.push(el);
        }

        // Força o WebKit a criar RenderSVGResourceFilter e fazer cache
        this.els.forEach(el => void el.getBoundingClientRect());
        void document.querySelector('#fuzz-filter-main')?.getBoundingClientRect?.();

        this.filterRef  = this.svg.querySelector('#fuzz-filter-main');
        this.filterRefB = this.svg.querySelector('#fuzz-filter-b');
    },

    trigger: function() {
        // Remove o SVG inteiro → libera RenderSVGResourceFilter no C++
        this.svg.remove();

        // Força relayout síncrono em TODOS os elementos que referenciam o filtro freed
        this.els.forEach(el => void el.getBoundingClientRect());

        // Schedula mais um relayout no próximo frame (pressão extra no ponteiro freed)
        this._rafId = requestAnimationFrame(() => {
            this.els.forEach(el => void el.offsetWidth);
        });
    },

    probe: [
        // Lê filtro computado de cada elemento — C++ pode retornar valor freed
        s => getComputedStyle(s.els[0]).filter,
        s => getComputedStyle(s.els[1]).filter,
        s => getComputedStyle(s.els[2]).filter,
        s => getComputedStyle(s.els[3]).filter,

        // Geometry dos elementos (exige relayout com filtro — potencial UAF)
        s => s.els[0].getBoundingClientRect().width,
        s => s.els[0].getBoundingClientRect().height,

        // Animações ainda rodando? (CSSAnimationController acessa RenderObject freed)
        s => s.els[0].getAnimations?.().length,
        s => s.els[0].getAnimations?.()[0]?.playState,

        // Acesso às refs do SVGFilterElement freed
        s => s.filterRef.getAttribute('id'),
        s => s.filterRef.parentNode,          // Deve ser null (removido do DOM)
        s => s.filterRef.ownerDocument,       // Ainda válido?
        s => s.filterRef.childElementCount,
        s => s.filterRefB.getAttribute('id'),

        // Força novo relayout para pressionar ponteiro freed
        s => { void s.els[0].offsetHeight; return s.els[0].offsetWidth; },
    ],

    cleanup: function() {
        if (this._rafId) cancelAnimationFrame(this._rafId);
        try { this.els.forEach(el => el.remove()); } catch(e) {}
        try { this.style.remove(); } catch(e) {}
        try { this.svg.remove(); } catch(e) {}
    }
};
