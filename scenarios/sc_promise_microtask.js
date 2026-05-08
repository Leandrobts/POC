/**
 * SC_PROMISE_MICROTASK.JS
 * Categoria : JS ENGINE — Use-After-Free (Microtask)
 * Alvo      : JSC Promise microtask queue / DOM access ordering
 * Técnica   : Encadeia Promise.resolve().then() com remoção de nó DOM
 *             intercalada. A microtask pode executar após o C++ ter
 *             liberado o nó se o GC correr entre o resolve e o .then().
 *             Testa também async/await sobre nó removido.
 * Referência: WebKit microtask/GC ordering bug pattern (JSC)
 */

export default {
    id:          'PROMISE_MICROTASK_UAF',
    category:    'JS ENGINE',
    risk:        'MEDIUM',
    description: 'Microtask Promise acessa nó DOM removido entre resolve e .then(). '
                + 'Testa ordering entre GC e microtask queue no JSC.',

    /* ── estado interno ──────────────────────────────────────────────── */
    _container:   null,
    _target:      null,
    _microResult: null,
    _microPhase:  null,
    _asyncResult: null,
    _chainDepth:  0,

    supported: function() {
        return typeof Promise !== 'undefined';
    },

    /* ── setup ──────────────────────────────────────────────────────── */
    setup: async function() {
        this._microResult = null;
        this._microPhase  = null;
        this._asyncResult = null;
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

    /* ── trigger ─────────────────────────────────────────────────────── */
    trigger: async function() {
        const el = this._target;

        // Cadeia profunda de microtasks (Promise chain)
        const deepChain = (n) => {
            let p = Promise.resolve(el);
            for (let i = 0; i < n; i++) {
                p = p.then(node => {
                    this._chainDepth++;
                    // Tenta ler o nó em cada microtask
                    try {
                        return { node, val: node.getAttribute('data-val'), conn: node.isConnected };
                    } catch(e) {
                        return { node: null, err: e.constructor.name };
                    }
                });
            }
            return p;
        };

        // Inicia a cadeia e remove o elemento ANTES que ela termine
        const chain = deepChain(20);
        el.remove(); // libera do DOM enquanto as microtasks estão na fila

        try {
            const result = await chain;
            this._microResult = result?.val ?? String(result?.err);
            this._microPhase  = result?.conn ? 'connected' : 'disconnected';
        } catch(e) {
            this._microResult = `ERROR:${e.constructor.name}`;
        }

        // Teste async/await
        const asyncRead = async (node) => {
            await Promise.resolve();
            return node.textContent;
        };

        try {
            this._asyncResult = await asyncRead(el);
        } catch(e) {
            this._asyncResult = `ERROR:${e.constructor.name}`;
        }

        await new Promise(r => setTimeout(r, 10));
    },

    /* ── probes ──────────────────────────────────────────────────────── */
    probe: [
        // [0-3] estado do nó após remoção
        s => s._target.isConnected,
        s => s._target.textContent,
        s => s._target.getAttribute('data-val'),
        s => s._target.nodeType,

        // [4-7] resultado das microtasks
        s => s._microResult,
        s => s._microPhase,
        s => s._chainDepth,
        s => typeof s._microResult,

        // [8-9] resultado async/await
        s => s._asyncResult,
        s => typeof s._asyncResult,

        // [10] container intacto
        s => s._container.isConnected,
        s => s._container.contains(s._target),
    ],

    /* ── cleanup ─────────────────────────────────────────────────────── */
    cleanup: async function() {
        this._container?.remove();
        this._container  = null;
        this._target     = null;
        this._microResult = null;
        this._microPhase  = null;
        this._asyncResult = null;
        this._chainDepth  = 0;
    }
};
