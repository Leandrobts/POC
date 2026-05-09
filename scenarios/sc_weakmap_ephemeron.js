/**
 * SC_WEAKMAP_EPHEMERON.JS  [v2 — falsos positivos corrigidos]
 *
 * FIX probe[4] — TYPE_CONFUSION string→boolean:
 *   _result era null (object) no baseline.
 *   s._result?.hasA ?? 'null' retornava 'null' (string).
 *   Após trigger, _result.hasA = true (boolean).
 *   Correção: inicializar _result como objeto com tipos corretos.
 *
 * FIX probe[8] — TYPE_CONFUSION string→boolean (mesma causa, hasAAfterGC).
 *
 * FIX probe[10] — TYPE_CONFUSION string→number:
 *   _result.dataAfterGC era undefined → ?? 'null' = 'null' (string).
 *   Após trigger, dataAfterGC = 3.14 (number).
 *   Correção: String() na probe[10] para forçar string sempre.
 */

export default {
    id:          'WEAKMAP_EPHEMERON_UAF',
    category:    'JS ENGINE',
    risk:        'MEDIUM',
    description: 'Ephemeron chain (WeakMap A→B→A) durante GC pressure. '
                + 'Testa ordering de coleta e acesso a obj semi-coletado via WeakRef.',

    _wm1:      null,
    _wm2:      null,
    _wr:       null,
    _sentinel: null,

    // FIX: _result inicializado com tipos corretos para o baseline capturar corretamente
    _result: {
        hasA:         false,    // boolean
        aValue:       'null',   // string
        wrBefore:     'null',   // string
        hasAAfterGC:  false,    // boolean
        aAfterGC:     'null',   // string
        dataAfterGC:  'null',   // string (FIX: era undefined→number após trigger)
    },
    _derefAfterGC: 'pending',   // FIX: era null

    supported: function() {
        return typeof WeakMap !== 'undefined';
    },

    setup: async function() {
        // FIX: reset com tipos corretos
        this._result = {
            hasA:         false,
            aValue:       'null',
            wrBefore:     'null',
            hasAAfterGC:  false,
            aAfterGC:     'null',
            dataAfterGC:  'null',
        };
        this._derefAfterGC = 'pending';

        this._wm1      = new WeakMap();
        this._wm2      = new WeakMap();
        this._sentinel = { id: 'canary', value: 0x1337CAFE };

        const objA = { ref: 'objA', data: new Float64Array(16).fill(3.14) };
        const objB = { ref: 'objB', data: new Float64Array(16).fill(2.71) };

        this._wm1.set(this._sentinel, objA);
        this._wm2.set(objA, this._sentinel);
        this._wm1.set(objB, this._sentinel);

        if (typeof WeakRef !== 'undefined') {
            this._wr = new WeakRef(objA);
        }

        void objB;
        await new Promise(r => setTimeout(r, 0));
    },

    trigger: async function() {
        const beforeGC = this._wm1.get(this._sentinel);
        this._result.hasA    = beforeGC !== undefined;         // boolean — correto
        this._result.aValue  = String(beforeGC?.ref ?? 'null'); // string  — correto
        this._result.wrBefore = this._wr?.deref()?.ref ?? 'collected'; // string — correto

        const pressure = [];
        for (let i = 0; i < 50; i++)
            pressure.push(new ArrayBuffer(128 * 1024));
        pressure.length = 0;

        await new Promise(r => setTimeout(r, 30));

        this._derefAfterGC = this._wr?.deref()?.ref ?? 'collected'; // string

        const afterGC = this._wm1.get(this._sentinel);
        this._result.hasAAfterGC = afterGC !== undefined;               // boolean
        this._result.aAfterGC    = String(afterGC?.ref ?? 'collected'); // string

        // FIX probe[10]: dataAfterGC sempre string para evitar string→number
        this._result.dataAfterGC = String(afterGC?.data?.[0] ?? 'null');
    },

    probe: [
        // [0-3] sentinela deve permanecer vivo
        s => s._sentinel?.id,
        s => s._sentinel?.value,
        s => typeof s._sentinel,
        s => String(s._wm1.has(s._sentinel)),

        // [4-7] resultado pré-GC — tipos agora estáveis desde o setup
        s => s._result.hasA,        // boolean → boolean (sem type change)
        s => s._result.aValue,      // string  → string
        s => s._result.wrBefore,    // string  → string
        s => typeof s._result.aValue,

        // [8-11] resultado pós-GC — tipos estáveis
        s => s._result.hasAAfterGC,  // boolean → boolean
        s => s._result.aAfterGC,     // string  → string
        s => s._result.dataAfterGC,  // string  → string  (FIX: era number)
        s => s._derefAfterGC,        // string  → string

        // [12-13] WeakMap com sentinela não deve ter sido coletado
        s => String(s._wm2.has(s._wm1.get(s._sentinel) ?? {})),
        s => typeof s._wm1.get(s._sentinel),
    ],

    cleanup: async function() {
        this._wm1      = null;
        this._wm2      = null;
        this._wr       = null;
        this._sentinel = null;
        this._result   = {
            hasA: false, aValue: 'null', wrBefore: 'null',
            hasAAfterGC: false, aAfterGC: 'null', dataAfterGC: 'null',
        };
        this._derefAfterGC = 'pending';
    }
};
