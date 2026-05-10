/**
 * SC_PROXY_TYPE_CONFUSION.JS  [v2 — OOM corrigido]
 *
 * FIX — OOM / infinite loop no teste do Array Proxy:
 *   O loop `for (i < pArr.length)` chamava o getter `length` em cada
 *   iteração. O getter fazia `arr.push()`, aumentando o comprimento.
 *   Na próxima iteração, `pArr.length` era maior → loop nunca terminava
 *   → array crescia até esgotar a memória do tab.
 *
 *   Correção: o getter `length` só faz push nas primeiras 4 leituras
 *   (guarda por `pushCount`). O loop usa `Math.min(pArr.length, CAP)`
 *   como limite superior com CAP=12 — cresce de 3 para no máximo 7
 *   elementos e para. Seguro, sem risco de OOM.
 */

export default {
    id:          'PROXY_TYPE_CONFUSION',
    category:    'JS ENGINE',
    risk:        'HIGH',
    description: 'Proxy com handlers que modificam o heap durante introspection. '
                + 'Testa invariant violations no JSC ProxyObject C++.',

    // Strings — sempre string
    _getResult:     'pending',
    _hasResult:     'pending',
    _setResult:     'pending',
    _ownKeysResult: 'pending',
    _applyResult:   'pending',

    // Numéricos
    _trapCount:     -1,
    _victimVal:     -1,   // soma do array proxy (number)
    _arrLenAfter:   -1,   // comprimento do array após o loop

    _victim:  null,
    _proxy:   null,
    _fnProxy: null,

    supported: function() {
        return typeof Proxy !== 'undefined';
    },

    setup: async function() {
        this._getResult     = 'pending'; this._hasResult     = 'pending';
        this._setResult     = 'pending'; this._ownKeysResult = 'pending';
        this._applyResult   = 'pending';
        this._trapCount     = 0;
        this._victimVal     = -1;
        this._arrLenAfter   = -1;

        this._victim = { x: 1, y: 2, z: 3, data: new Float64Array(8).fill(1.5) };

        const self = this;

        this._proxy = new Proxy(this._victim, {
            get(target, prop) {
                self._trapCount++;
                if (prop === 'x') {
                    target.z = target.z * 2;
                    return target[prop];
                }
                return target[prop];
            },
            has(target, prop) {
                self._trapCount++;
                delete target.y;
                return prop in target;
            },
            set(target, prop, value) {
                self._trapCount++;
                target[prop] = value;
                target.x = target.x + 1;
                return true;
            },
            ownKeys(target) {
                self._trapCount++;
                target.injected = 'uaf-probe';
                return Object.keys(target);
            },
        });

        const baseFn = function(a, b) { return a + b; };
        this._fnProxy = new Proxy(baseFn, {
            apply(target, thisArg, args) {
                self._trapCount++;
                args[0] = args[0] * 0xFFFF;   // overflow moderado (não 0xFFFFFFFF)
                return target.apply(thisArg, args);
            }
        });

        await new Promise(r => setTimeout(r, 0));
    },

    trigger: async function() {
        // A: get com mutação cruzada
        try {
            const v = this._proxy.x;
            this._getResult = String(v);
        } catch(e) { this._getResult = e.constructor.name; }

        // B: has com delete durante execução
        try {
            const h = 'y' in this._proxy;
            this._hasResult = String(h);
        } catch(e) { this._hasResult = e.constructor.name; }

        // C: set com mutação de x
        try {
            this._proxy.w = 99;
            this._setResult = String(this._victim.x);
        } catch(e) { this._setResult = e.constructor.name; }

        // D: ownKeys com injeção de chave
        try {
            const keys = Object.keys(this._proxy);
            this._ownKeysResult = keys.includes('injected') ? 'injected' : 'clean';
        } catch(e) { this._ownKeysResult = e.constructor.name; }

        // E: apply proxy com argumento multiplicado
        try {
            const r = this._fnProxy(2, 3);
            this._applyResult = String(r);   // esperado: 2*0xFFFF + 3 = 131075
        } catch(e) { this._applyResult = e.constructor.name; }

        // F: Array proxy — FIX: pushCount limita crescimento, CAP limita loop
        try {
            const arr = [1.1, 2.2, 3.3];
            let pushCount = 0;
            const CAP = 12;   // FIX: cap absoluto de iterações

            const pArr = new Proxy(arr, {
                get(t, p) {
                    if (p === 'length') {
                        // FIX: push apenas nas primeiras 4 leituras de length
                        if (pushCount < 4) {
                            t.push((pushCount + 1) * 1.1);
                            pushCount++;
                        }
                        return t.length;
                    }
                    return t[p];
                }
            });

            let sum = 0;
            // FIX: Math.min garante que o loop para mesmo se pArr.length crescer
            for (let i = 0; i < Math.min(pArr.length, CAP); i++) {
                sum += pArr[i] ?? 0;
            }

            this._victimVal   = Math.round(sum * 100) / 100;
            this._arrLenAfter = arr.length;   // deve ser 3 + pushCount pushes
        } catch(e) {
            this._victimVal   = -1;
            this._arrLenAfter = -1;
        }

        await new Promise(r => setTimeout(r, 0));
    },

    probe: [
        // [0-4] resultados dos traps — sempre string
        s => s._getResult,
        s => s._hasResult,
        s => s._setResult,
        s => s._ownKeysResult,
        s => s._applyResult,

        // [5-7] numéricos
        s => s._trapCount,      // número de traps disparados
        s => s._victimVal,      // soma do array
        s => s._arrLenAfter,    // comprimento após o loop (3 + pushes)

        // [8-11] estado do objeto original após mutações dos handlers
        s => String(s._victim.x         ?? 'null'),
        s => String('y' in s._victim),
        s => String(s._victim.injected  ?? 'null'),
        s => s._victim.data?.[0]        ?? -1,

        // [12] integridade do Float64Array
        s => String(s._victim.data instanceof Float64Array),
    ],

    cleanup: async function() {
        this._proxy   = null; this._fnProxy = null; this._victim = null;
        this._getResult = 'pending'; this._hasResult     = 'pending';
        this._setResult = 'pending'; this._ownKeysResult = 'pending';
        this._applyResult = 'pending';
        this._trapCount = -1; this._victimVal = -1; this._arrLenAfter = -1;
    }
};
