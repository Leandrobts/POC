/**
 * SC_DOMMATRIX_OVERFLOW.JS
 * Categoria : JS ENGINE — Integer/Float Overflow
 * Alvo      : WebCore::DOMMatrix / TransformationMatrix C++
 * Técnica   : Opera DOMMatrix com valores NaN, Infinity e near-MAX_SAFE_INTEGER.
 *             Testa se o motor serializa/deserializa a matriz corretamente
 *             e se operações encadeadas com valores extremos produzem
 *             resultados previsíveis ou vazam estado interno da FPU/SIMD.
 *             Um valor float64 anômalo no resultado pode indicar leitura
 *             de bytes adjacentes no backing store da matriz C++.
 * Referência: WebKit DOMMatrix float overflow / info leak pattern
 */

export default {
    id:          'DOMMATRIX_OVERFLOW',
    category:    'JS ENGINE',
    risk:        'HIGH',
    description: 'DOMMatrix com valores NaN/Infinity/MAX_SAFE_INTEGER encadeados. '
                + 'Testa overflow na TransformationMatrix C++ e possível info leak via float.',

    _victim:   null,

    // Numéricos — resultados das operações
    _m00: -1, _m11: -1, _m22: -1, _m33: -1,
    _det: -1,

    // Strings
    _nanResult:  'pending',
    _infResult:  'pending',
    _mulResult:  'pending',
    _invResult:  'pending',

    supported: function() {
        return typeof DOMMatrix !== 'undefined';
    },

    setup: async function() {
        this._m00 = -1; this._m11 = -1; this._m22 = -1; this._m33 = -1;
        this._det = -1;
        this._nanResult = 'pending'; this._infResult = 'pending';
        this._mulResult = 'pending'; this._invResult = 'pending';

        // Float64Array vítima para detectar OOB adjacente
        this._victim = new Float64Array(16);
        this._victim.fill(3.7337373737373737);

        await new Promise(r => setTimeout(r, 0));
    },

    trigger: async function() {
        // A: Matriz com NaN — como o motor serializa?
        try {
            const m = new DOMMatrix([NaN, 0, 0, 0, 0, NaN, 0, 0,
                                     0, 0, NaN, 0, 0, 0, 0, NaN]);
            this._nanResult = String(m.m11);   // NaN, Infinity ou número real = bug
            this._m00 = isNaN(m.m11) ? -2 : m.m11;
        } catch(e) { this._nanResult = e.constructor.name; }

        // B: Matriz com Infinity
        try {
            const m = new DOMMatrix([Infinity, 0, 0, 0, 0, Infinity, 0, 0,
                                     0, 0, 1, 0, 0, 0, 0, 1]);
            this._infResult = String(m.m11);
            this._m11 = isFinite(m.m11) ? m.m11 : -3;
        } catch(e) { this._infResult = e.constructor.name; }

        // C: Multiplicação de matrizes com valores extremos
        try {
            const a = new DOMMatrix();
            a.m11 = Number.MAX_SAFE_INTEGER;
            a.m22 = Number.MAX_SAFE_INTEGER;
            const b = new DOMMatrix();
            b.m11 = Number.MAX_SAFE_INTEGER;
            const r = a.multiply(b);
            this._mulResult = String(r.m11);
            this._m22 = isFinite(r.m11) ? Math.min(r.m11, 1e15) : -4;
        } catch(e) { this._mulResult = e.constructor.name; }

        // D: Inversão de matriz singular (determinante = 0)
        try {
            const m = new DOMMatrix([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,0]);
            const inv = m.inverse();
            this._invResult = String(inv.m11);
            this._det = isFinite(inv.m11) ? Math.min(Math.abs(inv.m11), 1e15) : -5;
            this._m33 = inv.is2D ? 1 : 0;
        } catch(e) { this._invResult = e.constructor.name; }

        // E: fromMatrix com objeto incompleto
        try {
            const m = DOMMatrix.fromMatrix({ a: NaN, b: Infinity, c: -0, d: NaN });
            void m.m11;
        } catch(_) {}

        // F: translateSelf com valores gigantes
        try {
            const m = new DOMMatrix();
            m.translateSelf(Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE);
            void m.m41;
        } catch(_) {}

        await new Promise(r => setTimeout(r, 0));
    },

    probe: [
        // [0-3] resultados numéricos — sentinelas -1,-2,-3,-4,-5 = erro/especial
        s => s._m00,    // -2 = NaN, -3 = Inf, número real = inesperado
        s => s._m11,
        s => s._m22,
        s => s._m33,

        // [4] determinante
        s => s._det,

        // [5-8] strings dos resultados
        s => s._nanResult,
        s => s._infResult,
        s => s._mulResult,
        s => s._invResult,

        // [9-11] vítima Float64 — detecta OOB adjacente à matriz C++
        s => s._victim[0],
        s => s._victim[8],
        s => s._victim[15],

        // [12] integridade do array vítima
        s => s._victim.every(v => Math.abs(v - 3.7337373737373737) < 1e-10)
             ? 'clean' : 'CORRUPTED',
        s => s._victim.byteLength,
    ],

    cleanup: async function() {
        this._victim = null;
        this._m00 = -1; this._m11 = -1; this._m22 = -1; this._m33 = -1;
        this._det = -1;
        this._nanResult = 'pending'; this._infResult = 'pending';
        this._mulResult = 'pending'; this._invResult = 'pending';
    }
};
