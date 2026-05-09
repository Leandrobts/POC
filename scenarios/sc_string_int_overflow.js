/**
 * SC_STRING_INT_OVERFLOW.JS  [v2 — falsos positivos corrigidos]
 *
 * FIX probe[2] — STALE_DATA: -1 → 6553500:
 *   _results era {} vazio no setup(). A probe[2] fazia
 *   s._results.concatLen ?? -1, retornando -1 no baseline.
 *   Após trigger, concatLen = 6553500. O executor via
 *   |6553500 - (-1)| > 1000 e sinalizava STALE_DATA.
 *   Correção: inicializar _results com -1 em todos os campos
 *   já no setup(), para que o baseline capture -1 e o pós-trigger
 *   também retorne -1 ?? -1 = -1 se não houver mudança real,
 *   ou o valor real se houver — e o threshold do executor
 *   só dispara em saltos > 1000, que continuam sendo relevantes.
 *
 * NOTA: o salto de -1 → 6553500 era legítimo (100×65535 = concatLen normal),
 *       mas foi classificado como STALE_DATA porque o baseline era -1.
 *       Com a inicialização correta, o baseline captura -1 e o pós
 *       captura 6553500 — mas isso é o comportamento esperado do concat,
 *       então a probe[2] foi alterada para nunca usar o threshold numérico:
 *       retorna string 'ok'|'fail' em vez de número bruto.
 */

export default {
    id:          'STRING_INT_OVERFLOW',
    category:    'JS ENGINE',
    risk:        'HIGH',
    description: 'Overflow em repeat/padStart com argumentos ~2^31. '
                + 'Testa alocação incorreta de buffer na JSString heap.',

    _victim:   null,
    // FIX: todos os campos inicializados com tipo correto
    _results:  { slice1: -1, slice2: -1, concatOk: 'pending' },

    supported: function() { return true; },

    setup: async function() {
        // FIX: reset com tipos corretos — slice1/slice2 number, concatOk string
        this._results = { slice1: -1, slice2: -1, concatOk: 'pending' };
        this._victim  = new Float64Array(16);
        this._victim.fill(2.2222222222222);
        await new Promise(r => setTimeout(r, 0));
    },

    trigger: async function() {
        const MAX32 = 0xFFFFFFFF;
        const MAX31 = 0x7FFFFFFF;

        try { 'a'.repeat(MAX32);        } catch(_) {}
        try { 'ab'.repeat(MAX31);       } catch(_) {}
        try { 'abc'.repeat(MAX31 / 3);  } catch(_) {}
        try { 'x'.padStart(MAX32, 'AB'); } catch(_) {}
        try { 'x'.padEnd(MAX32, 'CD');   } catch(_) {}
        try { ''.padStart(MAX31 + 1, 'Z'); } catch(_) {}

        try {
            const codes = new Uint16Array(65535);
            codes.fill(65);
            String.fromCharCode(...codes);
        } catch(_) {}

        const s = 'A'.repeat(1024);
        try { this._results.slice1 = s.slice(-MAX32, MAX32)?.length ?? -1; } catch(_) {}
        try { this._results.slice2 = s.slice(MAX31, MAX31 + 10)?.length ?? 0; } catch(_) {}

        // FIX probe[2]: em vez do comprimento bruto (que causa STALE_DATA falso),
        //               verifica se o concat produziu o tamanho esperado — retorna string
        try {
            let acc = '';
            for (let i = 0; i < 100; i++) acc += 'A'.repeat(65535);
            const expected = 100 * 65535;
            this._results.concatOk = acc.length === expected ? 'ok' : `wrong:${acc.length}`;
        } catch(e) {
            this._results.concatOk = `ERR:${e.constructor.name}`;
        }

        await new Promise(r => setTimeout(r, 0));
    },

    probe: [
        // [0-1] resultados numéricos de slice — inicializados como -1
        s => s._results.slice1,
        s => s._results.slice2,

        // [2] FIX: string em vez de número bruto — elimina STALE_DATA falso
        s => s._results.concatOk,

        // [3-4] tipos
        s => typeof s._results.slice1,
        s => typeof s._results.concatOk,

        // [5-7] vítima Float64 — detecta OOB write
        s => s._victim[0],
        s => s._victim[8],
        s => s._victim[15],

        // [8-9] integridade
        s => s._victim.every(v => Math.abs(v - 2.2222222222222) < 1e-10) ? 'clean' : 'CORRUPTED',
        s => s._victim.byteLength,

        // [10-11] strings simples ainda funcionam?
        s => 'hello'.repeat(3),
        s => 'world'.padStart(10, '0'),
    ],

    cleanup: async function() {
        this._victim  = null;
        this._results = { slice1: -1, slice2: -1, concatOk: 'pending' };
    }
};
