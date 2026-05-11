/**
 * SC_DOMMATRIX_OVERFLOW.JS  [v2 — falso positivo STALE_DATA corrigido]
 *
 * FIX probe[2] — STALE_DATA: -1 → 1000000000000000:
 *   _m22 recebia Math.min(r.m11, 1e15) onde r.m11 = MAX_SAFE_INT².
 *   O cap 1e15 evitou Infinity mas produziu valor > 1000.
 *   |1e15 - (-1)| > 1000 → STALE_DATA falso positivo.
 *
 *   Correção: _m22 agora classifica o resultado em categorias numéricas
 *   pequenas que não ultrapassam o threshold:
 *     -1 = não calculado (sentinela)
 *     -4 = resultado Infinity/NaN (erro esperado)
 *      0 = resultado zero
 *      1 = resultado finito razoável (< 1e10)
 *      2 = resultado finito gigante (>= 1e10, mas sem overflow C++)
 *      3 = resultado anômalo (valor de ponteiro ou lixo de memória)
 *
 *   Transição -1→1 (delta 2) e -1→2 (delta 3) ficam abaixo de 1000.
 *   Anomalia real (ex: _m22=3 para valor de ponteiro) ainda sinaliza.
 *   Os valores brutos ficam capturados em _mulResult (string).
 */

export default {
    id:          'DOMMATRIX_OVERFLOW',
    category:    'JS ENGINE',
    risk:        'HIGH',
    description: 'DOMMatrix com valores NaN/Infinity/MAX_SAFE_INTEGER encadeados. '
                + 'Testa overflow na TransformationMatrix C++ e possível info leak via float.',

    _victim:  null,

    // Numéricos — categorias pequenas (delta < 1000)
    _m00: -1,   // -2=NaN, -3=Inf, 0=zero, 1=finito, 3=anômalo
    _m11: -1,
    _m22: -1,   // FIX: era Math.min(r.m11, 1e15) — agora categoria
    _m33: -1,
    _det: -1,

    // Strings — valor bruto para análise
    _nanResult:  'pending',
    _infResult:  'pending',
    _mulResult:  'pending',   // valor bruto como string
    _invResult:  'pending',

    supported: function() {
        return typeof DOMMatrix !== 'undefined';
    },

    setup: async function() {
        this._m00 = -1; this._m11 = -1; this._m22 = -1;
        this._m33 = -1; this._det = -1;
        this._nanResult = 'pending'; this._infResult = 'pending';
        this._mulResult = 'pending'; this._invResult = 'pending';
        this._victim = new Float64Array(16);
        this._victim.fill(3.7337373737373737);
        await new Promise(r => setTimeout(r, 0));
    },

    // Helper: classifica um float64 numa categoria < 1000
    _classify: function(v) {
        if (v === undefined || v === null) return -1;
        if (isNaN(v))                      return -2;   // NaN
        if (!isFinite(v))                  return -3;   // ±Infinity
        if (v === 0)                       return  0;   // zero exato
        // Verifica se parece um ponteiro userspace (bits 48-63 = 0x0000)
        try {
            const buf = new ArrayBuffer(8);
            new Float64Array(buf)[0] = v;
            const hi = new Uint32Array(buf)[1];
            if ((hi >>> 16) === 0 && Math.abs(v) > 0x10000) return 3; // ponteiro!
        } catch(_) {}
        if (Math.abs(v) < 1e10) return 1;  // finito razoável
        return 2;                           // finito gigante (overflow de inteiro)
    },

    trigger: async function() {
        // A: Matriz com NaN
        try {
            const m = new DOMMatrix([NaN, 0, 0, 0, 0, NaN, 0, 0,
                                     0, 0, NaN, 0, 0, 0, 0, NaN]);
            this._nanResult = String(m.m11);
            this._m00       = this._classify(m.m11);
        } catch(e) { this._nanResult = e.constructor.name; }

        // B: Matriz com Infinity
        try {
            const m = new DOMMatrix([Infinity, 0, 0, 0, 0, Infinity, 0, 0,
                                     0, 0, 1, 0, 0, 0, 0, 1]);
            this._infResult = String(m.m11);
            this._m11       = this._classify(m.m11);
        } catch(e) { this._infResult = e.constructor.name; }

        // C: Multiplicação com MAX_SAFE_INTEGER²
        try {
            const a = new DOMMatrix(); a.m11 = Number.MAX_SAFE_INTEGER; a.m22 = Number.MAX_SAFE_INTEGER;
            const b = new DOMMatrix(); b.m11 = Number.MAX_SAFE_INTEGER;
            const r = a.multiply(b);
            // FIX: guarda valor bruto em string, categoria numérica em _m22
            this._mulResult = String(r.m11);
            this._m22       = this._classify(r.m11);   // 1=razoável, 2=gigante, 3=ponteiro
        } catch(e) { this._mulResult = e.constructor.name; }

        // D: Inversão de matriz singular
        try {
            const m   = new DOMMatrix([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,0]);
            const inv = m.inverse();
            this._invResult = String(inv.m11);
            this._det       = this._classify(inv.m11);
            this._m33       = inv.is2D ? 1 : 0;
        } catch(e) { this._invResult = e.constructor.name; }

        // E: fromMatrix incompleto
        try {
            const m = DOMMatrix.fromMatrix({ a: NaN, b: Infinity, c: -0, d: NaN });
            void m.m11;
        } catch(_) {}

        // F: translateSelf com MAX_VALUE
        try {
            const m = new DOMMatrix();
            m.translateSelf(Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE);
            void m.m41;
        } catch(_) {}

        await new Promise(r => setTimeout(r, 0));
    },

    probe: [
        // [0-4] categorias numéricas — todos delta < 1000
        s => s._m00,   // -2=NaN, -3=Inf, 0=zero, 1=ok, 3=ponteiro(!)
        s => s._m11,
        s => s._m22,   // FIX: categoria em vez de valor bruto
        s => s._m33,
        s => s._det,

        // [5-8] strings com valores brutos para análise manual
        s => s._nanResult,
        s => s._infResult,
        s => s._mulResult,   // ex: 'Infinity' ou '9007199254740992' ou valor ponteiro
        s => s._invResult,

        // [9-11] vítima Float64 — detecta OOB adjacente à matriz C++
        s => s._victim[0],
        s => s._victim[8],
        s => s._victim[15],

        // [12-13] integridade
        s => s._victim.every(v => Math.abs(v - 3.7337373737373737) < 1e-10)
             ? 'clean' : 'CORRUPTED',
        s => s._victim.byteLength,
    ],

    cleanup: async function() {
        this._victim = null;
        this._m00 = -1; this._m11 = -1; this._m22 = -1; this._m33 = -1; this._det = -1;
        this._nanResult = 'pending'; this._infResult = 'pending';
        this._mulResult = 'pending'; this._invResult = 'pending';
    }
};
