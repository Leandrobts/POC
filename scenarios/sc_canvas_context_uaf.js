/**
 * SC_CANVAS_CONTEXT_UAF.JS  [v2 — falso positivo STALE_DATA corrigido]
 *
 * FIX probe[0] — STALE_DATA: 64 → 65535:
 *   O trigger fazia `this._canvas.width = 0xFFFF`, que é a operação
 *   interessante (resize de canvas removido). Mas probe[0] lia
 *   `s._canvas.width` diretamente, capturando 64 no baseline e 65535
 *   pós-trigger → |delta| > 1000 → STALE_DATA falso positivo.
 *   Correção: probe[0] passa a retornar string indicando se a largura
 *   bateu com o valor que tentamos setar — o STALE_DATA não pode
 *   disparar em campos string. O valor genuinamente anômalo (OOB no
 *   backing store do bitmap) continua detectável via probe[8-10].
 *
 * LÓGICA DE DETECÇÃO:
 *   - canvas.width = 0xFFFF aceito sem crash → probe[0] = 'resized'
 *   - getImageData pós-remoção funciona    → probe[10] = 'ok'
 *   - pixel R muda para 0 (azul)           → probe[9] salta de 255 a 0
 *     (delta = 255 < 1000, não é STALE_DATA — detectado por BOOLEAN_FLIP
 *      ou comparação manual de baseline vs pós)
 */

export default {
    id:          'CANVAS_CONTEXT_UAF',
    category:    'DOM/GPU',
    risk:        'HIGH',
    description: 'CanvasRenderingContext2D operado após canvas removido do DOM. '
                + 'Testa acesso ao bitmap C++ e backing store pós-free.',

    _canvas:     null,
    _ctx:        null,
    _container:  null,

    // Numéricos
    _widthBase:  -1,
    _heightBase: -1,
    _pixelR:     -1,
    _pixelRAfter:-1,

    // Strings — probe[0] e outros que dependem de operações do trigger
    _resizeResult: 'pending',   // FIX: era _canvas.width (number) → agora string
    _fillBase:     'pending',
    _fillAfter:    'none',
    _imgDataErr:   'none',

    supported: function() {
        try {
            const c = document.createElement('canvas');
            return !!c.getContext('2d');
        } catch(_) { return false; }
    },

    setup: async function() {
        this._widthBase    = -1; this._heightBase  = -1;
        this._pixelR       = -1; this._pixelRAfter = -1;
        this._resizeResult = 'pending';   // FIX
        this._fillBase     = 'pending';
        this._fillAfter    = 'none';
        this._imgDataErr   = 'none';

        this._container = document.createElement('div');
        document.body.appendChild(this._container);

        this._canvas = document.createElement('canvas');
        this._canvas.width  = 64;
        this._canvas.height = 64;
        this._canvas.style.cssText = 'position:absolute;left:-9999px';
        this._container.appendChild(this._canvas);

        this._ctx = this._canvas.getContext('2d');

        // Desenha padrão vermelho com quadrado verde
        this._ctx.fillStyle = '#ff0000';
        this._ctx.fillRect(0, 0, 64, 64);
        this._ctx.fillStyle = '#00ff00';
        this._ctx.fillRect(10, 10, 20, 20);

        // Captura baseline
        this._widthBase  = this._canvas.width;    // 64
        this._heightBase = this._canvas.height;   // 64
        this._fillBase   = this._ctx.fillStyle;   // '#00ff00'

        try {
            const px = this._ctx.getImageData(0, 0, 1, 1);
            this._pixelR = px.data[0];             // 255 (vermelho)
        } catch(_) { this._pixelR = -1; }

        void this._canvas.offsetWidth;
        await new Promise(r => requestAnimationFrame(r));
        await new Promise(r => setTimeout(r, 0));
    },

    trigger: async function() {
        // Remove o canvas do DOM
        this._canvas.remove();
        void document.body.offsetWidth;

        // Redesenha com azul após remoção
        try {
            this._ctx.fillStyle = '#0000ff';
            this._ctx.fillRect(0, 0, 64, 64);
            this._fillAfter = this._ctx.fillStyle;   // '#0000ff' se funcionou
        } catch(_) {
            this._fillAfter = 'draw-error';
        }

        // getImageData sobre canvas removido
        try {
            const px = this._ctx.getImageData(0, 0, 1, 1);
            this._pixelRAfter = px.data[0];          // 0 se azul sobrescreveu
            this._imgDataErr  = 'ok';
        } catch(e) {
            this._pixelRAfter = -1;
            this._imgDataErr  = e.constructor.name;
        }

        // FIX: em vez de só setar e ler o number, registramos o resultado
        // como string — assim probe[0] nunca dispara STALE_DATA
        try {
            this._canvas.width = 0xFFFF;
            // Se chegou aqui sem crash, o resize foi aceito
            this._resizeResult = this._canvas.width === 0xFFFF ? 'resized' : 'reset';
        } catch(e) {
            this._resizeResult = e.constructor.name;
        }

        await new Promise(r => setTimeout(r, 0));
    },

    probe: [
        // [0] FIX: string em vez de number — nunca dispara STALE_DATA
        //     'pending'  → setup não completou
        //     'resized'  → canvas.width=0xFFFF aceito (possível OOB no bitmap)
        //     'reset'    → motor ignorou o resize e voltou ao valor seguro
        //     'RangeError' → lançou exceção (comportamento seguro esperado)
        s => s._resizeResult,

        // [1-3] dimensões capturadas no baseline — sempre number
        s => s._widthBase,     // 64
        s => s._heightBase,    // 64

        // [4-7] fillStyle — sempre string
        s => s._ctx.fillStyle,
        s => s._fillBase,      // '#00ff00' baseline
        s => s._fillAfter,     // '#0000ff' pós-trigger
        s => String(s._ctx.canvas === s._canvas),

        // [8-11] getImageData pós-remoção — pixel R
        s => s._pixelR,        // 255 (baseline, number)
        s => s._pixelRAfter,   // 0 esperado se redesenhou (number)
        s => s._imgDataErr,    // 'ok' ou nome de exceção (string)
        s => String(s._canvas.isConnected),

        // [12-13] container
        s => String(s._container.isConnected),
        s => s._container.children.length,
    ],

    cleanup: async function() {
        this._container?.remove();
        this._container    = null; this._canvas      = null; this._ctx = null;
        this._widthBase    = -1;   this._heightBase  = -1;
        this._pixelR       = -1;   this._pixelRAfter = -1;
        this._resizeResult = 'pending';
        this._fillBase     = 'pending'; this._fillAfter  = 'none';
        this._imgDataErr   = 'none';
    }
};
