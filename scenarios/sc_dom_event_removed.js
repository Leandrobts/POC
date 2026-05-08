/**
 * SC_DOM_EVENT_REMOVED.JS
 * Categoria : DOM — Use-After-Free
 * Alvo      : WebCore::EventTarget / Node C++ lifecycle
 * Técnica   : Adiciona event listeners num elemento, remove o elemento
 *             do DOM e despacha eventos sintéticos sobre o nó removido.
 *             O EventTarget C++ pode ser liberado enquanto o dispatcher
 *             JS ainda detém referência, causando UAF no handler.
 * Referência: WebKit EventTarget lifecycle bug pattern
 */

export default {
    id:          'DOM_EVENT_REMOVED_ELEMENT',
    category:    'DOM',
    risk:        'HIGH',
    description: 'Despacha eventos sobre nó removido do DOM. '
                + 'Testa se o EventTarget C++ sobrevive ao GC após remoção.',

    /* ── estado interno ──────────────────────────────────────────────── */
    _el:           null,
    _child:        null,
    _container:    null,
    _fireCount:    0,
    _lastTarget:   null,
    _lastType:     null,
    _bubbleCount:  0,

    supported: function() { return typeof document !== 'undefined'; },

    /* ── setup ──────────────────────────────────────────────────────── */
    setup: async function() {
        this._fireCount   = 0;
        this._bubbleCount = 0;
        this._lastTarget  = null;
        this._lastType    = null;

        this._container = document.createElement('div');
        document.body.appendChild(this._container);

        this._el = document.createElement('div');
        this._el.id = 'uaf-dom-target';

        this._child = document.createElement('span');
        this._child.textContent = 'canary';
        this._el.appendChild(this._child);

        // Listener no próprio elemento
        this._el.addEventListener('click', (e) => {
            this._fireCount++;
            this._lastTarget = e.target?.nodeName ?? 'null';
            this._lastType   = e.type;
        });

        // Listener de bubbling no container
        this._container.addEventListener('click', () => {
            this._bubbleCount++;
        });

        // Listeners adicionais para cobertura
        this._el.addEventListener('mouseover', () => { this._fireCount++; });
        this._el.addEventListener('focus',     () => { this._fireCount++; });
        this._el.addEventListener('input',     () => { this._fireCount++; });
        this._el.addEventListener('blur',      () => { this._fireCount++; });

        this._container.appendChild(this._el);
        void this._el.offsetWidth;
        await new Promise(r => setTimeout(r, 0));
    },

    /* ── trigger ─────────────────────────────────────────────────────── */
    trigger: async function() {
        // Remove do DOM
        this._el.remove();
        void document.body.offsetWidth;

        // Despacha eventos sobre o nó removido
        const types = ['click', 'mouseover', 'focus', 'input', 'blur'];
        for (const type of types) {
            try {
                this._el.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
            } catch(_) {}
        }

        // Despacha sobre o filho também
        try {
            this._child.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        } catch(_) {}

        await new Promise(r => setTimeout(r, 10));
    },

    /* ── probes ──────────────────────────────────────────────────────── */
    probe: [
        // [0-4] estado do elemento após remoção e dispatch
        s => s._el.isConnected,
        s => s._el.nodeType,
        s => s._el.nodeName,
        s => s._el.id,
        s => s._el.childNodes.length,

        // [5-8] contadores de callbacks — subida após remoção = UAF candidato
        s => s._fireCount,
        s => s._lastTarget,
        s => s._lastType,
        s => s._bubbleCount,    // não deveria ter subido (el foi removido)

        // [9-11] estado do filho
        s => s._child.isConnected,
        s => s._child.parentNode === s._el,
        s => s._child.textContent,

        // [12-13] container não contaminado
        s => s._container.contains(s._el),
        s => s._container.children.length,
    ],

    /* ── cleanup ─────────────────────────────────────────────────────── */
    cleanup: async function() {
        this._container?.remove();
        this._container  = null;
        this._el         = null;
        this._child      = null;
        this._lastTarget = null;
        this._lastType   = null;
        this._fireCount   = 0;
        this._bubbleCount = 0;
    }
};
