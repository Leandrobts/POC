/**
 * SC_WEBGL_BUFFER_OVERFLOW.JS
 * Categoria : GPU/MEDIA — Integer Overflow / OOB
 * Alvo      : WebCore::WebGLBuffer / GraphicsContextGLOpenGL C++
 * Técnica   : Aloca WebGLBuffer com tamanhos extremos via bufferData(),
 *             tenta leituras OOB via bufferSubData() com offsets gigantes,
 *             e verifica se INVALID_OPERATION é retornado corretamente
 *             ou se o motor acessa memória fora do buffer alocado.
 * Referência: WebKit WebGL integer overflow pattern (CVE-2022-32868)
 */

export default {
    id:          'WEBGL_BUFFER_OVERFLOW',
    category:    'GPU/MEDIA',
    risk:        'HIGH',
    description: 'WebGLBuffer bufferData/bufferSubData com tamanhos e offsets extremos. '
                + 'Testa overflow no cálculo de tamanho no driver OpenGL do PS4.',

    _canvas:   null,
    _gl:       null,
    _buf:      null,

    // Campos numéricos — sempre number
    _err0:     -1,   // getError após bufferData gigante
    _err1:     -1,   // getError após bufferSubData OOB
    _err2:     -1,   // getError após draw com buffer corrompido
    _bufSize:  -1,   // tamanho real do buffer alocado

    // Campos string — sempre string
    _supported: 'pending',
    _errStr0:   'none',
    _errStr1:   'none',

    supported: function() {
        const c = document.createElement('canvas');
        const g = c.getContext('webgl') || c.getContext('experimental-webgl');
        return !!g;
    },

    setup: async function() {
        this._err0 = -1; this._err1 = -1; this._err2 = -1; this._bufSize = -1;
        this._errStr0 = 'none'; this._errStr1 = 'none'; this._supported = 'pending';

        this._canvas = document.createElement('canvas');
        this._canvas.width  = 1;
        this._canvas.height = 1;
        this._canvas.style.cssText = 'position:absolute;left:-9999px';
        document.body.appendChild(this._canvas);

        this._gl = this._canvas.getContext('webgl')
                || this._canvas.getContext('experimental-webgl');

        if (!this._gl) { this._supported = 'no-webgl'; return; }
        this._supported = 'ok';

        this._buf = this._gl.createBuffer();
        this._gl.bindBuffer(this._gl.ARRAY_BUFFER, this._buf);
        // Buffer legítimo de 64 bytes
        this._gl.bufferData(this._gl.ARRAY_BUFFER, 64, this._gl.DYNAMIC_DRAW);
        this._gl.getError(); // flush errors
        await new Promise(r => setTimeout(r, 0));
    },

    trigger: async function() {
        if (!this._gl || this._supported !== 'ok') return;

        // A: bufferData com tamanho near INT_MAX — overflow na alocação C++
        try {
            this._gl.bufferData(this._gl.ARRAY_BUFFER, 0x7FFFFFFF, this._gl.DYNAMIC_DRAW);
            this._err0 = this._gl.getError();   // INVALID_VALUE=1281 esperado
        } catch(e) {
            this._err0    = -1;
            this._errStr0 = e.constructor.name;
        }

        // B: bufferSubData com src offset near UINT32_MAX — OOB write no buffer C++
        try {
            const data = new Float32Array([1.1, 2.2, 3.3, 4.4]);
            this._gl.bufferSubData(this._gl.ARRAY_BUFFER, 0xFFFFFFFF - 8, data);
            this._err1 = this._gl.getError();   // INVALID_VALUE esperado
        } catch(e) {
            this._err1    = -1;
            this._errStr1 = e.constructor.name;
        }

        // C: realocar com tamanho 0 e tentar ler
        try {
            this._gl.bufferData(this._gl.ARRAY_BUFFER, 0, this._gl.DYNAMIC_DRAW);
            this._err2    = this._gl.getError();
            this._bufSize = 0;
        } catch(e) {
            this._err2    = -1;
            this._bufSize = -1;
        }

        await new Promise(r => setTimeout(r, 0));
    },

    probe: [
        // [0-3] getError codes — sempre number
        s => s._err0,    // INVALID_VALUE=1281 esperado; 0=NO_ERROR=bug
        s => s._err1,    // INVALID_VALUE=1281 esperado
        s => s._err2,
        s => s._bufSize,

        // [4-5] strings de erro JS inesperado
        s => s._errStr0,
        s => s._errStr1,

        // [6-7] estado do contexto WebGL
        s => s._supported,
        s => String(s._gl?.isContextLost?.() ?? 'null'),

        // [8] buffer ainda vinculado?
        s => {
            try {
                const param = s._gl?.getBufferParameter(s._gl.ARRAY_BUFFER, s._gl.BUFFER_SIZE);
                return param ?? -1;
            } catch(_) { return -1; }
        },
    ],

    cleanup: async function() {
        try { this._gl?.deleteBuffer(this._buf); } catch(_) {}
        this._canvas?.remove();
        this._canvas = null; this._gl = null; this._buf = null;
        this._err0 = -1; this._err1 = -1; this._err2 = -1; this._bufSize = -1;
        this._errStr0 = 'none'; this._errStr1 = 'none'; this._supported = 'pending';
    }
};
