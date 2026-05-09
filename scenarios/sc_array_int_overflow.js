/**
 * CENÁRIO: ARRAY_MATH_INTEGER_OVERFLOW  [v2 — falsos positivos corrigidos]
 * Superfície C++: JSArray.cpp / JSGenericTypedArrayView.cpp / ArrayBuffer.cpp
 * Risco: HIGH
 *
 * FIXES aplicados:
 *
 * ① probe[6] — TYPE_CONFUSION object→undefined (falso positivo):
 *    Causa raiz: na baseline, s.results.subArr é undefined (falsy),
 *    ternário retornava null (type object).
 *    Pós-trigger, subarray(0xFFFFFFF0,0xFFFFFFFF) retorna TypedArray
 *    vazio (length=0, mas TRUTHY!), então subArr[0] = undefined.
 *    Fix: probe[6] agora retorna sempre string:
 *      'absent'  — subArr não foi criado (path de erro)
 *      'oob'     — TypedArray existe mas está vazio (comprimento 0 ou OOB)
 *      valor hex — byte lido com sucesso (indica read de memória real)
 *
 * ② results = {} — todos os campos undefined no baseline:
 *    Pattern s.results.X ?? s.results.XErr com ambos undefined → undefined.
 *    Embora o executor padrão não flagie undefined→number, versões
 *    modificadas podem. Fix: sentinelas tipados corretos desde o setup().
 *
 * ③ setup/trigger agora async para consistência com o executor.
 */

export default {
    id:       'ARRAY_MATH_INTEGER_OVERFLOW',
    category: 'Boundary',
    risk:     'HIGH',
    description:
        'Integer overflow em operações de array sem loops (O(1)). ' +
        'Testa push() em array length=0xFFFFFFFF, splice() com índice near INT_MIN, ' +
        'TypedArray subarray offset+length overflow, e ArrayBuffer.transfer().',

    /* ── estado interno ──────────────────────────────────────────────── */
    // FIX ②: sentinelas com tipo correto desde a declaração
    results: {
        pushLen:        -1,            // number
        pushErr:        'none',        // string
        spliceLen:      -1,            // number
        spliceErr:      'none',        // string
        sliceLen:       -1,            // number
        sliceErr:       'none',        // string
        subArrLen:      -1,            // number
        subArrErr:      'none',        // string
        subArr:         null,          // object  (TypedArray ou null)
        dataViewErr:    'none',        // string
        bigOffsetErr:   'none',        // string
    },
    buffer: null,

    /* ── setup ──────────────────────────────────────────────────────── */
    setup: async function() {
        // FIX ②: reset com sentinelas tipados — nunca undefined
        this.results = {
            pushLen:      -1,
            pushErr:      'none',
            spliceLen:    -1,
            spliceErr:    'none',
            sliceLen:     -1,
            sliceErr:     'none',
            subArrLen:    -1,
            subArrErr:    'none',
            subArr:       null,
            dataViewErr:  'none',
            bigOffsetErr: 'none',
        };
        this.buffer = new ArrayBuffer(16);
    },

    /* ── trigger ─────────────────────────────────────────────────────── */
    trigger: async function() {
        // A: push() overflow (0xFFFFFFFF + 1 wraps para 0)
        try {
            const arr = [];
            arr.length = 0xFFFFFFFF;
            arr.push(1337);
            this.results.pushLen = arr.length;   // number
        } catch(e) {
            this.results.pushErr = e.constructor.name;  // string
        }

        // B: splice() com índice near INT_MIN (underflow de signed 32-bit)
        try {
            const arr = [1, 2, 3, 4, 5];
            arr.splice(-0x80000001, 1);
            this.results.spliceLen = arr.length;   // number
        } catch(e) {
            this.results.spliceErr = e.constructor.name;
        }

        // C: slice() com índices que somam > UINT32_MAX
        try {
            const arr = new Array(100).fill(1.1);
            const r = arr.slice(0xFFFFFFF0, 0xFFFFFFFF);
            this.results.sliceLen = r.length;   // number
        } catch(e) {
            this.results.sliceErr = e.constructor.name;
        }

        // D: TypedArray subarray com offset+length overflow
        try {
            const ta = new Uint8Array(this.buffer);
            const sub = ta.subarray(0xFFFFFFF0, 0xFFFFFFFF);
            this.results.subArr    = sub;
            this.results.subArrLen = sub.byteLength;   // number
        } catch(e) {
            this.results.subArrErr = e.constructor.name;
        }

        // E: DataView com offset gigante (RangeError esperado — bypass = bug)
        try {
            new DataView(this.buffer, 0xFFFFFFFF, 1);
            this.results.dataViewErr = 'no-throw';   // FIX: string (bypass detectado)
        } catch(e) {
            this.results.dataViewErr = e.constructor.name;
        }

        // F: TypedArray constructor com byteOffset near MAX_SAFE_INTEGER
        try {
            const ab = new ArrayBuffer(8);
            new Uint8Array(ab, Number.MAX_SAFE_INTEGER - 7, 1);
            this.results.bigOffsetErr = 'no-throw';   // bypass detectado
        } catch(e) {
            this.results.bigOffsetErr = e.constructor.name;
        }

        await new Promise(r => setTimeout(r, 0));
    },

    /* ── probes ──────────────────────────────────────────────────────── */
    probe: [
        // [0] push: -1 (sentinela) ou comprimento pós-overflow (number)
        s => s.results.pushLen !== -1 ? s.results.pushLen : s.results.pushErr,

        // [1] splice: -1 ou comprimento pós-underflow (number)
        s => s.results.spliceLen !== -1 ? s.results.spliceLen : s.results.spliceErr,

        // [2] slice: -1 ou comprimento (number)
        s => s.results.sliceLen !== -1 ? s.results.sliceLen : s.results.sliceErr,

        // [3] subarray: comprimento do TypedArray retornado (number)
        s => s.results.subArrLen !== -1 ? s.results.subArrLen : s.results.subArrErr,

        // [4] DataView: sempre string ('RangeError' esperado; 'no-throw' = bug)
        s => s.results.dataViewErr,

        // [5] BigOffset: sempre string ('RangeError' esperado; 'no-throw' = bug)
        s => s.results.bigOffsetErr,

        // [6] FIX ①: sempre retorna string — nunca null nem undefined
        //     'absent'  → subArr não existe (erro no trigger)
        //     'oob'     → TypedArray criado mas vazio (length=0, índice inválido)
        //     '0x{hex}' → byte lido com sucesso (memória real acessada — UAF candidato)
        s => {
            try {
                if (!s.results.subArr) return 'absent';
                if (s.results.subArr.length === 0) return 'oob';
                const v = s.results.subArr[0];
                if (v === undefined) return 'oob';
                return `0x${v.toString(16).padStart(2, '0')}`;
            } catch(e) {
                return e.constructor.name;
            }
        },
    ],

    /* ── cleanup ─────────────────────────────────────────────────────── */
    cleanup: async function() {
        this.results = {
            pushLen: -1, pushErr: 'none', spliceLen: -1, spliceErr: 'none',
            sliceLen: -1, sliceErr: 'none', subArrLen: -1, subArrErr: 'none',
            subArr: null, dataViewErr: 'none', bigOffsetErr: 'none',
        };
        this.buffer = null;
    }
};
