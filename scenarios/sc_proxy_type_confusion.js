/**
 * SC_PROXY_TYPE_CONFUSION.JS
 * Categoria : JS ENGINE — Type Confusion
 * Alvo      : JSC JSProxy / ProxyObject C++ handler dispatch
 * Técnica   : Cria Proxies com handlers que modificam o heap durante
 *             operações de introspection (has, get, set, ownKeys).
 *             Um handler que lança exceção no meio de uma operação
 *             interna do JSC pode deixar o motor em estado inconsistente.
 *             Testa também Proxy sobre Array para confundir o Butterfly.
 * Referência: JSC Proxy invariant violation / type confusion pattern
 */

export default {
    id:          'PROXY_TYPE_CONFUSION',
    category:    'JS ENGINE',
    risk:        'HIGH',
    description: 'Proxy com handlers que modificam o heap durante introspection. '
                + 'Testa invariant violations no JSC ProxyObject C++.',

    // Strings — sempre string
    _getResult:      'pending',
    _hasResult:      'pending',
    _setResult:      'pending',
    _ownKeysResult:  'pending',
    _applyResult:    'pending',

    // Numéricos
    _trapCount:      -1,
    _victimVal:      -1,

    _victim:  null,
    _proxy:   null,
    _fnProxy: null,

    supported: function() {
        return typeof Proxy !== 'undefined';
    },

    setup: async function() {
        this._getResult     = 'pending';
        this._hasResult     = 'pending';
        this._setResult     = 'pending';
        this._ownKeysResult = 'pending';
        this._applyResult   = 'pending';
        this._trapCount     = 0;
        this._victimVal     = 0xCAFE;

        this._victim = { x: 1, y: 2, z: 3, data: new Float64Array(8).fill(1.5) };

        const self = this;

        // Proxy com handler que modifica o target durante o trap
        this._proxy = new Proxy(this._victim, {
            get(target, prop) {
                self._trapCount++;
                // Modifica o objeto durante a leitura — invariant violation candidato
                if (prop === 'x') {
                    target.z = target.z * 2;         // muta durante get
                    return target[prop];
                }
                return target[prop];
            },
            has(target, prop) {
                self._trapCount++;
                delete target.y;                      // muta durante has
                return prop in target;
            },
            set(target, prop, value) {
                self._trapCount++;
                target[prop] = value;
                target.x = target.x + 1;             // muta x durante set de outro campo
                return true;
            },
            ownKeys(target) {
                self._trapCount++;
                target.injected = 'uaf-probe';        // injeta chave durante ownKeys
                return Object.keys(target);
            },
        });

        // Proxy sobre função
        const baseFn = function(a, b) { return a + b; };
        this._fnProxy = new Proxy(baseFn, {
            apply(target, thisArg, args) {
                self._trapCount++;
                // Modifica args durante apply
                args[0] = args[0] * 0xFFFFFFFF;
                return target.apply(thisArg, args);
            }
        });

        await new Promise(r => setTimeout(r, 0));
    },

    trigger: async function() {
        // A: get trap com mutação
        try {
            const v = this._proxy.x;
            this._getResult = String(v);
        } catch(e) { this._getResult = e.constructor.name; }

        // B: has trap com delete durante execução
        try {
            const h = 'y' in this._proxy;
            this._hasResult = String(h);
        } catch(e) { this._hasResult = e.constructor.name; }

        // C: set trap com mutação cruzada
        try {
            this._proxy.w = 99;
            this._setResult = String(this._proxy.x);
        } catch(e) { this._setResult = e.constructor.name; }

        // D: ownKeys com injeção de chave
        try {
            const keys = Object.keys(this._proxy);
            this._ownKeysResult = keys.includes('injected') ? 'injected' : 'clean';
        } catch(e) { this._ownKeysResult = e.constructor.name; }

        // E: apply proxy com overflow de argumento
        try {
            const r = this._fnProxy(2, 3);
            this._applyResult = String(r);
        } catch(e) { this._applyResult = e.constructor.name; }

        // F: Array proxy para confundir Butterfly
        try {
            const arr  = [1.1, 2.2, 3.3];
            const pArr = new Proxy(arr, {
                get(t, p) {
                    if (p === 'length') { t.push(4.4); return t.length; }
                    return t[p];
                }
            });
            // Itera via proxy — length muda durante o loop
            let sum = 0;
            for (let i = 0; i < pArr.length; i++) sum += pArr[i] ?? 0;
            this._victimVal = sum;
        } catch(_) { this._victimVal = -1; }

        await new Promise(r => setTimeout(r, 0));
    },

    probe: [
        // [0-4] resultados dos traps — sempre string
        s => s._getResult,
        s => s._hasResult,
        s => s._setResult,
        s => s._ownKeysResult,
        s => s._applyResult,

        // [5] contagem de traps disparados — number
        s => s._trapCount,

        // [6] victimVal: soma do array proxy — number
        s => s._victimVal,

        // [7-9] estado do objeto original após mutações dos handlers
        s => String(s._victim.x ?? 'null'),
        s => String('y' in s._victim),       // foi deletado no has trap
        s => String(s._victim.injected ?? 'null'),

        // [10-11] integridade do Float64Array dentro do objeto
        s => s._victim.data?.[0] ?? -1,
        s => String(s._victim.data instanceof Float64Array),
    ],

    cleanup: async function() {
        this._proxy   = null;
        this._fnProxy = null;
        this._victim  = null;
        this._getResult = 'pending'; this._hasResult     = 'pending';
        this._setResult = 'pending'; this._ownKeysResult = 'pending';
        this._applyResult = 'pending';
        this._trapCount = -1; this._victimVal = -1;
    }
};
