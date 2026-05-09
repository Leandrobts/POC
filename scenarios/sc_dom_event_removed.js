/**
 * SC_DOM_EVENT_REMOVED.JS  [v2 — falsos positivos corrigidos]
 *
 * FIX probe[6] / probe[7] — TYPE_CONFUSION object→string:
 *   _lastTarget e _lastType eram inicializados como null (tipo object).
 *   Após o trigger recebiam string ('SPAN', 'click').
 *   O executor via object→string = TYPE_CONFUSION falso.
 *   Correção: inicializar ambos como 'none' (string) desde o setup().
 */

export default {
    id:          'DOM_EVENT_REMOVED_ELEMENT',
    category:    'DOM',
    risk:        'HIGH',
    description: 'Despacha eventos sobre nó removido do DOM. '
                + 'Testa se o EventTarget C++ sobrevive ao GC após remoção.',

    _el:          null,
    _child:       null,
    _container:   null,
    _fireCount:   0,
    _lastTarget:  'none',   // FIX: string desde a declaração
    _lastType:    'none',   // FIX: string desde a declaração
    _bubbleCount: 0,

    supported: function() { return typeof document !== 'undefined'; },

    setup: async function() {
        this._fireCount   = 0;
        this._bubbleCount = 0;
        this._lastTarget  = 'none';   // FIX
        this._lastType    = 'none';   // FIX

        this._container = document.createElement('div');
        document.body.appendChild(this._container);

        this._el = document.createElement('div');
        this._el.id = 'uaf-dom-target';

        this._child = document.createElement('span');
        this._child.textContent = 'canary';
        this._el.appendChild(this._child);

        this._el.addEventListener('click', (e) => {
            this._fireCount++;
            this._lastTarget = e.target?.nodeName ?? 'none';
            this._lastType   = e.type ?? 'none';
        });

        this._container.addEventListener('click', () => {
            this._bubbleCount++;
        });

        this._el.addEventListener('mouseover', () => { this._fireCount++; });
        this._el.addEventListener('focus',     () => { this._fireCount++; });
        this._el.addEventListener('input',     () => { this._fireCount++; });
        this._el.addEventListener('blur',      () => { this._fireCount++; });

        this._container.appendChild(this._el);
        void this._el.offsetWidth;
        await new Promise(r => setTimeout(r, 0));
    },

    trigger: async function() {
        this._el.remove();
        void document.body.offsetWidth;

        const types = ['click', 'mouseover', 'focus', 'input', 'blur'];
        for (const type of types) {
            try {
                this._el.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
            } catch(_) {}
        }

        try {
            this._child.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        } catch(_) {}

        await new Promise(r => setTimeout(r, 10));
    },

    probe: [
        // [0-4] estado do elemento após remoção e dispatch
        s => s._el.isConnected,
        s => s._el.nodeType,
        s => s._el.nodeName,
        s => s._el.id,
        s => s._el.childNodes.length,

        // [5-8] contadores — _lastTarget/_lastType agora sempre string
        s => s._fireCount,
        s => s._lastTarget,    // string: 'none' → 'SPAN' se disparou pós-remoção
        s => s._lastType,      // string: 'none' → 'click' se disparou pós-remoção
        s => s._bubbleCount,

        // [9-11] filho
        s => s._child.isConnected,
        s => s._child.parentNode === s._el,
        s => s._child.textContent,

        // [12-13] container
        s => s._container.contains(s._el),
        s => s._container.children.length,
    ],

    cleanup: async function() {
        this._container?.remove();
        this._container  = null;
        this._el         = null;
        this._child      = null;
        this._lastTarget = 'none';
        this._lastType   = 'none';
        this._fireCount   = 0;
        this._bubbleCount = 0;
    }
};
