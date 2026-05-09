/**
 * SC_CANVAS_CONTEXT_UAF.JS
 * Categoria : DOM/GPU — Use-After-Free
 * Alvo      : WebCore::CanvasRenderingContext2D / HTMLCanvasElement C++
 * Técnica   : Obtém um CanvasRenderingContext2D, remove o canvas do DOM
 *             e continua a operar sobre o contexto. O contexto 2D mantém
 *             ponteiro para o canvas C++ que pode ser coletado.
 *             Também testa getImageData() pós-remoção, que acessa
 *             diretamente o backing store do bitmap no C++.
 * Referência: WebKit Canvas context lifecycle UAF
 */

export default {
    id:          'CANVAS_CONTEXT_UAF',
    category:    'DOM/GPU',
    risk:        'HIGH',
    description: 'CanvasRenderingContext2D operado após canvas removido do DOM. '
                + 'Testa acesso ao bitmap C++ e ao canvas backing store pós-free.',

    _canvas:      null,
    _ctx:         null,
    _container:   null,

    // Numéricos
    _widthBase:   -1,
    _heightBase:  -1,
    _pixelR:      -1,   // canal R do pixel (0,0) antes do trigger
    _pixelRAfter: -1,   // canal R pós-trigger

    // Strings
    _fillBase:    'pending',
    _fillAfter:   'none',
    _imgDataErr:  'none',

    supported: function() {
        try {
            const c = document.createElement('canvas');
            return !!c.getContext('2d');
        } catch(_) { return false; }
    },

    setup: async function() {
        this._widthBase = -1; this._heightBase = -1;
        this._pixelR = -1; this._pixelRAfter = -1;
        this._fillBase = 'pending'; this._fillAfter = 'none';
        this._imgDataErr = 'none';

        this._container = document.createElement('div');
        document.body.appendChild(this._container);

        this._canvas = document.createElement('canvas');
        this._canvas.width  = 64;
        this._canvas.height = 64;
        this._canvas.style.cssText = 'position:absolute;left:-9999px';
        this._container.appendChild(this._canvas);

        this._ctx = this._canvas.getContext('2d');

        // Desenha padrão conhecido
        this._ctx.fillStyle = '#ff0000';
        this._ctx.fillRect(0, 0, 64, 64);
        this._ctx.fillStyle = '#00ff00';
        this._ctx.fillRect(10, 10, 20, 20);

        // Captura baseline
        this._widthBase  = this._canvas.width;
        this._heightBase = this._canvas.height;
        this._fillBase   = this._ctx.fillStyle;

        try {
            const px = this._ctx.getImageData(0, 0, 1, 1);
            this._pixelR = px.data[0];   // canal R = 255 (vermelho)
        } catch(_) { this._pixelR = -1; }

        void this._canvas.offsetWidth;
        await new Promise(r => requestAnimationFrame(r));
        await new Promise(r => setTimeout(r, 0));
    },

    trigger: async function() {
        // Remove o canvas do DOM
        this._canvas.remove();
        void document.body.offsetWidth;

        // Opera sobre o contexto com canvas removido
        try {
            this._ctx.fillStyle = '#0000ff';   // altera cor
            this._ctx.fillRect(0, 0, 64, 64);  // redesenha
            this._fillAfter = this._ctx.fillStyle;
        } catch(_) {
            this._fillAfter = 'draw-error';
        }

        // getImageData sobre canvas removido — acessa backing store C++
        try {
            const px = this._ctx.getImageData(0, 0, 1, 1);
            this._pixelRAfter = px.data[0];
            this._imgDataErr  = 'ok';
        } catch(e) {
            this._pixelRAfter = -1;
            this._imgDataErr  = e.constructor.name;
        }

        // Tenta redimensionar canvas removido
        try {
            this._canvas.width = 0xFFFF;   // overflow no bitmap interno?
        } catch(_) {}

        await new Promise(r => setTimeout(r, 0));
    },

    probe: [
        // [0-3] dimensões do canvas após remoção e redimensionamento
        s => s._canvas.width,
        s => s._widthBase,      // baseline: 64
        s => s._canvas.height,
        s => s._heightBase,     // baseline: 64

        // [4-7] contexto operado após remoção
        s => s._ctx.fillStyle,
        s => s._fillBase,       // baseline: '#ff0000'
        s => s._fillAfter,      // pós-trigger: '#0000ff' ou 'draw-error'
        s => String(s._ctx.canvas === s._canvas),

        // [8-11] getImageData pós-remoção — canal R
        s => s._pixelR,         // baseline: 255 (vermelho)
        s => s._pixelRAfter,    // pós-trigger: 0 (azul) se funcionou
        s => s._imgDataErr,     // 'ok' ou erro
        s => String(s._canvas.isConnected),

        // [12-13] container
        s => String(s._container.isConnected),
        s => s._container.children.length,
    ],

    cleanup: async function() {
        this._container?.remove();
        this._container = null; this._canvas = null; this._ctx = null;
        this._widthBase = -1; this._heightBase = -1;
        this._pixelR = -1; this._pixelRAfter = -1;
        this._fillBase = 'pending'; this._fillAfter = 'none';
        this._imgDataErr = 'none';
    }
};
