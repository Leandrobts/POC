/**
 * SC_PROMISE_MICROTASK.JS  [v2 — falsos positivos corrigidos]
 *
 * FIX probe[4] / probe[5] / probe[8] — TYPE_CONFUSION object→string:
 *   _microResult, _microPhase e _asyncResult eram null (object).
 *   Após o trigger recebiam strings ('TypeError', 'disconnected', 'microtask-canary').
 *   Correção: inicializar os três como 'pending' (string) no setup().
 */

export default {
    id:          'PROMISE_MICROTASK_UAF',
    category:    'JS ENGINE',
    risk:        'MEDIUM',
    description: 'Microtask Promise acessa nó DOM removido entre resolve e .then(). '
                + 'Testa ordering entre GC e microtask queue no JSC.',

    _container:   null,
    _target:      null,
    _microResult: 'pending',   // FIX: era null
    _microPhase:  'pending',   // FIX: era null
    _asyncResult: 'pending',   // FIX: era null
    _chainDepth:  0,

    supported: function() {
        return typeof Promise !== 'undefined';
    },

    setup: async function() {
        this._microResult = 'pending';   // FIX
        this._microPhase  = 'pending';   // FIX
        this._asyncResult = 'pending';   // FIX
        this._chainDepth  = 0;

        this._container = document.createElement('div');
        document.body.appendChild(this._container);

        this._target = document.createElement('div');
        this._target.id = 'promise-uaf-target';
        this._target.textContent = 'microtask-canary';
        this._target.setAttribute('data-val', '42');
        this._container.appendChild(this._target);

        void this._target.offsetWidth;
        await new Promise(r => setTimeout(r, 0));
    },

    trigger: async function() {
        const el = this._target;

        const deepChain = (n) => {
            let p = Promise.resolve(el);
            for (let i = 0; i < n; i++) {
                p = p.then(node => {
                    this._chainDepth++;
                    try {
                        return { node, val: node.getAttribute('data-val'), conn: node.isConnected };
                    } catch(e) {
                        return { node: null, err: e.constructor.name };
                    }
                });
            }
            return p;
        };

        const chain = deepChain(20);
        el.remove(); // libera do DOM enquanto microtasks estão na fila

        try {
            const result = await chain;
            // FIX: garante que _microResult e _microPhase são sempre string
            this._microResult = String(result?.val ?? result?.err ?? 'empty');
            this._microPhase  = result?.conn ? 'connected' : 'disconnected';
        } catch(e) {
            this._microResult = `ERROR:${e.constructor.name}`;
            this._microPhase  = 'error';
        }

        const asyncRead = async (node) => {
            await Promise.resolve();
            return node.textContent;
        };

        try {
            this._asyncResult = String(await asyncRead(el));
        } catch(e) {
            this._asyncResult = `ERROR:${e.constructor.name}`;
        }

        await new Promise(r => setTimeout(r, 10));
    },

    probe: [
        // [0-3] estado do nó
        s => s._target.isConnected,
        s => s._target.textContent,
        s => s._target.getAttribute('data-val'),
        s => s._target.nodeType,

        // [4-7] resultado das microtasks — sempre string
        s => s._microResult,   // 'pending' → string real (sem type change)
        s => s._microPhase,    // 'pending' → 'connected'|'disconnected'|'error'
        s => s._chainDepth,
        s => typeof s._microResult,

        // [8-9] resultado async/await — sempre string
        s => s._asyncResult,   // 'pending' → string real
        s => typeof s._asyncResult,

        // [10-11] container
        s => s._container.isConnected,
        s => s._container.contains(s._target),
    ],

    cleanup: async function() {
        this._container?.remove();
        this._container  = null;
        this._target     = null;
        this._microResult = 'pending';
        this._microPhase  = 'pending';
        this._asyncResult = 'pending';
        this._chainDepth  = 0;
    }
};
