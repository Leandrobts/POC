/**
 * SC_GETTER_GC_TRAP.JS
 * Categoria : JS ENGINE — Type Confusion / UAF
 * Alvo      : JSC PropertyDescriptor / GetterSetter C++ lifecycle
 * Técnica   : Define getters via Object.defineProperty que disparam
 *             side effects (GC pressure, modificação do próprio objeto,
 *             lançamento de exceção) quando acessados por operações
 *             internas do JSC como JSON.stringify, for...in, spread,
 *             Object.keys e instanceof. Testa se o motor mantém
 *             invariantes de tipo durante o acesso ao getter.
 * Referência: JSC GetterSetter C++ trap / AbstractValue confusion
 */

export default {
    id:          'GETTER_GC_TRAP',
    category:    'JS ENGINE',
    risk:        'HIGH',
    description: 'Getters com side effects disparados por operações internas do JSC. '
                + 'Testa invariantes de tipo durante JSON.stringify, spread e for...in.',

    // Strings
    _jsonResult:   'pending',
    _spreadResult: 'pending',
    _keysResult:   'pending',
    _forInResult:  'pending',
    _assignResult: 'pending',

    // Numéricos
    _getterCount:  -1,
    _victim:       null,
    _victimVal:    -1,

    supported: function() {
        return typeof Object.defineProperty !== 'undefined';
    },

    setup: async function() {
        this._jsonResult   = 'pending'; this._spreadResult = 'pending';
        this._keysResult   = 'pending'; this._forInResult  = 'pending';
        this._assignResult = 'pending';
        this._getterCount  = 0;
        this._victimVal    = 42;
        this._victim       = new Float64Array(8).fill(7.777777777777777);
        await new Promise(r => setTimeout(r, 0));
    },

    trigger: async function() {
        const self = this;

        // Objeto com getters com side effects
        const obj = {};
        let pressureBuffer = null;

        Object.defineProperty(obj, 'a', {
            enumerable: true,
            get() {
                self._getterCount++;
                // GC pressure durante o getter
                pressureBuffer = new Array(10000).fill(null);
                pressureBuffer = null;
                return 1;
            }
        });

        Object.defineProperty(obj, 'b', {
            enumerable: true,
            get() {
                self._getterCount++;
                // Modifica o próprio objeto durante o getter
                delete obj.c;
                obj.d = 999;
                return 2;
            }
        });

        Object.defineProperty(obj, 'c', {
            enumerable: true,
            get() {
                self._getterCount++;
                // Lança e captura exceção durante stringify
                try { throw new RangeError('getter-trap'); } catch(_) {}
                return 3;
            }
        });

        Object.defineProperty(obj, 'leak', {
            enumerable: true,
            get() {
                self._getterCount++;
                // Retorna o Float64Array interno — possível info leak
                return self._victim;
            }
        });

        // A: JSON.stringify — acessa todos os getters enumeráveis
        try {
            const s = JSON.stringify(obj);
            this._jsonResult = s?.slice(0, 60) ?? 'null';
        } catch(e) { this._jsonResult = e.constructor.name; }

        // B: Object spread — acessa getters via [[OwnPropertyKeys]]
        try {
            const spread = { ...obj };
            this._spreadResult = String(Object.keys(spread).sort().join(','));
        } catch(e) { this._spreadResult = e.constructor.name; }

        // C: Object.keys — enumera com getters ativos
        try {
            const keys = Object.keys(obj);
            this._keysResult = keys.sort().join(',');
        } catch(e) { this._keysResult = e.constructor.name; }

        // D: for...in — iteração com side effects em cada getter
        try {
            const visited = [];
            for (const k in obj) {
                visited.push(k);
                void obj[k];   // aciona o getter
            }
            this._forInResult = visited.sort().join(',');
        } catch(e) { this._forInResult = e.constructor.name; }

        // E: Object.assign — copia com getters como fontes
        try {
            const target = {};
            Object.assign(target, obj);
            this._assignResult = String(Object.keys(target).length);
        } catch(e) { this._assignResult = e.constructor.name; }

        // F: Getter que retorna tipo diferente a cada chamada
        const chameleon = {};
        let callIdx = 0;
        const types = [1, 'two', true, null, {}, [], Symbol('x')];
        Object.defineProperty(chameleon, 'x', {
            get() {
                self._getterCount++;
                return types[callIdx++ % types.length];
            }
        });

        try {
            for (let i = 0; i < types.length; i++) {
                const v = chameleon.x;
                if (typeof v === 'number') this._victimVal = v;
            }
        } catch(_) {}

        await new Promise(r => setTimeout(r, 0));
    },

    probe: [
        // [0-4] sempre string
        s => s._jsonResult,
        s => s._spreadResult,
        s => s._keysResult,
        s => s._forInResult,
        s => s._assignResult,

        // [5-6] numéricos
        s => s._getterCount,
        s => s._victimVal,

        // [7-9] vítima Float64 — detecta OOB via getter leak
        s => s._victim[0],
        s => s._victim[4],
        s => s._victim[7],

        // [10] integridade
        s => s._victim.every(v => Math.abs(v - 7.777777777777777) < 1e-10)
             ? 'clean' : 'CORRUPTED',
        s => s._victim.byteLength,
    ],

    cleanup: async function() {
        this._victim       = null;
        this._jsonResult   = 'pending'; this._spreadResult = 'pending';
        this._keysResult   = 'pending'; this._forInResult  = 'pending';
        this._assignResult = 'pending';
        this._getterCount  = -1; this._victimVal = -1;
    }
};
