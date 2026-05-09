/**
 * CENÁRIO: ARRAY_MATH_INTEGER_OVERFLOW  [v3 — tipos separados por campo]
 * Superfície C++: JSArray.cpp / JSGenericTypedArrayView.cpp / ArrayBuffer.cpp
 * Risco: HIGH
 *
 * HISTÓRICO DE FIXES:
 *   v1 — original: results={} no setup → baseline undefined → TYPE_CONFUSION
 *   v2 — sentinelas tipados, mas ternários mistos:
 *        `spliceLen !== -1 ? spliceLen : spliceErr`
 *        retornava string no baseline ('none') e number pós-trigger (4/0) → TYPE_CONFUSION
 *   v3 — tipos COMPLETAMENTE SEPARADOS por campo:
 *        campos *Len sempre number (sentinela -1, resultado real, ou -1 em erro)
 *        campos *Err sempre string (sentinela 'none', ou nome da exceção)
 *        probes leem UM campo por probe — tipo nunca muda entre baseline e pós-trigger.
 *
 * LÓGICA DE DETECÇÃO (com executor padrão):
 *   - Overflow real (ex: arr.length = 0xFFFFFFFF após push): 
 *       spliceLen salta de -1 para 0xFFFFFFFF → |delta| > 1000 → STALE_DATA ✓
 *   - Comportamento normal (splice retorna 4): 
 *       spliceLen salta de -1 para 4 → |delta| = 5 < 1000 → silencioso ✓
 *   - RangeError esperado:
 *       *Err permanece 'RangeError' → nenhuma mudança → silencioso ✓
 *   - Bypass de RangeError (bug real):
 *       *Err muda de 'none' para 'no-throw' → mudança de string → STALE detectável ✓
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
    results: {
        // Campos numéricos — SEMPRE number
        pushLen:    -1,
        spliceLen:  -1,
        sliceLen:   -1,
        subArrLen:  -1,
        // Campos de erro — SEMPRE string
        pushErr:    'none',
        spliceErr:  'none',
        sliceErr:   'none',
        subArrErr:  'none',
        dataViewErr:  'none',
        bigOffsetErr: 'none',
        // Referência ao TypedArray
        subArr: null,
    },
    buffer: null,

    /* ── setup ──────────────────────────────────────────────────────── */
    setup: async function() {
        this.results = {
            pushLen:      -1,
            spliceLen:    -1,
            sliceLen:     -1,
            subArrLen:    -1,
            pushErr:      'none',
            spliceErr:    'none',
            sliceErr:     'none',
            subArrErr:    'none',
            dataViewErr:  'none',
            bigOffsetErr: 'none',
            subArr:       null,
        };
        this.buffer = new ArrayBuffer(16);
    },

    /* ── trigger ─────────────────────────────────────────────────────── */
    trigger: async function() {
        // A: push() overflow — length = 0xFFFFFFFF + 1 deve lançar ou wrapa para 0
        try {
            const arr = [];
            arr.length = 0xFFFFFFFF;
            arr.push(1337);
            this.results.pushLen = arr.length;         // number (overflow real = 0)
        } catch(e) {
            this.results.pushLen = -1;                 // mantém sentinela number
            this.results.pushErr = e.constructor.name; // string separada
        }

        // B: splice() com índice near INT_MIN (-2147483649 underflowa)
        try {
            const arr = [1, 2, 3, 4, 5];
            arr.splice(-0x80000001, 1);
            this.results.spliceLen = arr.length;       // number
        } catch(e) {
            this.results.spliceLen = -1;
            this.results.spliceErr = e.constructor.name;
        }

        // C: slice() com índices que somam > UINT32_MAX
        try {
            const arr = new Array(100).fill(1.1);
            const r = arr.slice(0xFFFFFFF0, 0xFFFFFFFF);
            this.results.sliceLen = r.length;          // number
        } catch(e) {
            this.results.sliceLen = -1;
            this.results.sliceErr = e.constructor.name;
        }

        // D: TypedArray subarray com offset+length overflow
        try {
            const ta = new Uint8Array(this.buffer);
            const sub = ta.subarray(0xFFFFFFF0, 0xFFFFFFFF);
            this.results.subArr    = sub;
            this.results.subArrLen = sub.byteLength;   // number
        } catch(e) {
            this.results.subArrLen = -1;
            this.results.subArrErr = e.constructor.name;
        }

        // E: DataView com offset gigante (RangeError esperado — bypass = bug)
        try {
            new DataView(this.buffer, 0xFFFFFFFF, 1);
            this.results.dataViewErr = 'no-throw';     // bypass detectado
        } catch(e) {
            this.results.dataViewErr = e.constructor.name; // 'RangeError' esperado
        }

        // F: TypedArray constructor com byteOffset near MAX_SAFE_INTEGER
        try {
            const ab = new ArrayBuffer(8);
            new Uint8Array(ab, Number.MAX_SAFE_INTEGER - 7, 1);
            this.results.bigOffsetErr = 'no-throw';    // bypass detectado
        } catch(e) {
            this.results.bigOffsetErr = e.constructor.name;
        }

        await new Promise(r => setTimeout(r, 0));
    },

    /* ── probes ──────────────────────────────────────────────────────── */
    probe: [
        // ── campos numéricos (SEMPRE number) ──────────────────────────
        // Baseline: -1 | Normal pós-trigger: valor pequeno (não sinaliza)
        // Overflow real: valor gigante → |delta| > 1000 → STALE_DATA ✓

        // [0] push: -1 → sentinela/erro | 0 → overflow | outro → resultado normal
        s => s.results.pushLen,

        // [1] splice: -1 → sentinela/erro | 4 → normal | 0xFFFFFFFF → overflow
        s => s.results.spliceLen,

        // [2] slice: -1 → sentinela/erro | 0 → normal (índices OOB) | grande → overflow
        s => s.results.sliceLen,

        // [3] subarray: -1 → sentinela/erro | 0 → normal | grande → overflow !!!
        s => s.results.subArrLen,

        // ── campos de erro (SEMPRE string) ────────────────────────────
        // Baseline: 'none' | Esperado: 'RangeError' | Bug: 'no-throw' ou outro

        // [4] DataView offset gigante — RangeError esperado
        s => s.results.dataViewErr,

        // [5] TypedArray byteOffset gigante — RangeError esperado
        s => s.results.bigOffsetErr,

        // [6] Leitura de memória via subarray — sempre string
        //   'absent' → subArr não foi criado (erro)
        //   'oob'    → TypedArray criado mas vazio (length=0, comportamento normal)
        //   '0xNN'   → byte lido com sucesso → memória real acessada → UAF candidato ✓
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
            pushLen: -1, spliceLen: -1, sliceLen: -1, subArrLen: -1,
            pushErr: 'none', spliceErr: 'none', sliceErr: 'none',
            subArrErr: 'none', dataViewErr: 'none', bigOffsetErr: 'none',
            subArr: null,
        };
        this.buffer = null;
    }
};
