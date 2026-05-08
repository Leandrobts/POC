/**
 * SC_WEAKMAP_EPHEMERON.JS
 * Categoria : JS ENGINE — GC / Ephemeron Ordering
 * Alvo      : JSC WeakMap / Ephemeron table processing
 * Técnica   : Cria cadeias de ephemeron (WeakMap onde chaves e valores
 *             referenciam-se mutuamente). Durante o GC, a ordem de
 *             processamento dos ephemeron pode causar leitura de objetos
 *             semi-coletados (grey-to-black invariant violation).
 *             Testa também WeakRef.deref() durante GC pressure.
 * Referência: JSC Ephemeron GC ordering bug pattern
 */

export default {
    id:          'WEAKMAP_EPHEMERON_UAF',
    category:    'JS ENGINE',
    risk:        'MEDIUM',
    description: 'Ephemeron chain (WeakMap A→B→A) durante GC pressure. '
                + 'Testa ordering de coleta e acesso a obj semi-coletado via WeakRef.',

    /* ── estado interno ──────────────────────────────────────────────── */
    _wm1:       null,
    _wm2:       null,
    _wr:        null,
    _sentinel:  null,
    _result:    null,
    _derefAfterGC: null,

    supported: function() {
        return typeof WeakMap !== 'undefined';
    },

    /* ── setup ──────────────────────────────────────────────────────── */
    setup: async function() {
        this._result        = null;
        this._derefAfterGC  = null;

        // WeakMaps para cadeias de ephemeron
        this._wm1 = new WeakMap();
        this._wm2 = new WeakMap();

        // Objeto sentinela — mantido vivo via this._sentinel
        this._sentinel = { id: 'canary', value: 0x1337CAFE };

        // Cadeia ephemeron: wm1[sentinel] = objA, wm2[objA] = sentinel
        const objA = { ref: 'objA', data: new Float64Array(16).fill(3.14) };
        const objB = { ref: 'objB', data: new Float64Array(16).fill(2.71) };

        this._wm1.set(this._sentinel, objA);
        this._wm2.set(objA, this._sentinel);
        this._wm1.set(objB, this._sentinel);

        // WeakRef para observar quando o GC coleta objA
        if (typeof WeakRef !== 'undefined') {
            this._wr = new WeakRef(objA);
        }

        // Mantemos objB mas não objA — objA deve ser coletável
        void objB;

        await new Promise(r => setTimeout(r, 0));
    },

    /* ── trigger ─────────────────────────────────────────────────────── */
    trigger: async function() {
        // Lê via WeakMap ANTES de pressionar o GC
        const beforeGC = this._wm1.get(this._sentinel);
        this._result = {
            hasA: beforeGC !== undefined,
            aValue: beforeGC?.ref ?? 'null',
            wrBefore: this._wr?.deref()?.ref ?? 'collected',
        };

        // Pressão de GC pesada para forçar coleta de objA
        const pressure = [];
        for (let i = 0; i < 50; i++) {
            pressure.push(new ArrayBuffer(128 * 1024)); // 50 × 128KB = 6.4MB
        }
        pressure.length = 0; // libera tudo

        await new Promise(r => setTimeout(r, 30));

        // Lê via WeakRef após GC — pode estar coletado
        this._derefAfterGC = this._wr?.deref()?.ref ?? 'collected';

        // Tenta usar o valor ainda presente no WeakMap
        const afterGC = this._wm1.get(this._sentinel);
        this._result.hasAAfterGC  = afterGC !== undefined;
        this._result.aAfterGC     = afterGC?.ref ?? 'collected';
        this._result.dataAfterGC  = afterGC?.data?.[0] ?? 'null';
    },

    /* ── probes ──────────────────────────────────────────────────────── */
    probe: [
        // [0-3] sentinela deve permanecer vivo (referência forte)
        s => s._sentinel?.id,
        s => s._sentinel?.value,
        s => typeof s._sentinel,
        s => s._wm1.has(s._sentinel),

        // [4-7] resultado pré-GC
        s => s._result?.hasA     ?? 'null',
        s => s._result?.aValue   ?? 'null',
        s => s._result?.wrBefore ?? 'null',
        s => typeof s._result?.aValue,

        // [8-11] resultado pós-GC
        s => s._result?.hasAAfterGC ?? 'null',
        s => s._result?.aAfterGC    ?? 'null',
        s => s._result?.dataAfterGC ?? 'null',
        s => s._derefAfterGC        ?? 'null',

        // [12-13] WeakMap com sentinela não deve ter sido coletado
        s => s._wm2.has(s._wm1.get(s._sentinel) ?? {}),
        s => typeof s._wm1.get(s._sentinel),
    ],

    /* ── cleanup ─────────────────────────────────────────────────────── */
    cleanup: async function() {
        this._wm1       = null;
        this._wm2       = null;
        this._wr        = null;
        this._sentinel  = null;
        this._result    = null;
        this._derefAfterGC = null;
    }
};
