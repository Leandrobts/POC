/**
 * SC_DOCUMENT_FRAGMENT_UAF.JS
 * Categoria : DOM — Use-After-Free
 * Alvo      : WebCore::DocumentFragment C++ lifecycle
 * Técnica   : Cria um DocumentFragment com filhos, faz appendChild() que
 *             move todos os filhos para o DOM (esvaziando o Fragment),
 *             e opera sobre o Fragment stale. O C++ FragmentParseContext
 *             pode manter ponteiros para os nós transferidos.
 *             Também testa insertAdjacentHTML() que usa Fragment internamente.
 * Referência: WebKit DocumentFragment post-adoption UAF
 */

export default {
    id:          'DOCUMENT_FRAGMENT_UAF',
    category:    'DOM',
    risk:        'HIGH',
    description: 'DocumentFragment operado após seus filhos serem adotados pelo DOM. '
                + 'Testa ponteiro stale no FragmentParseContext C++ do WebCore.',

    _frag:         null,
    _container:    null,
    _adoptedNodes: null,

    // Numéricos
    _childCountPre:  -1,
    _childCountPost: -1,

    // Strings
    _fragOwner:  'pending',
    _nodeText:   'pending',
    _cloneErr:   'none',
    _queryErr:   'none',

    supported: function() {
        return typeof document.createDocumentFragment !== 'undefined';
    },

    setup: async function() {
        this._childCountPre  = -1; this._childCountPost = -1;
        this._fragOwner      = 'pending'; this._nodeText = 'pending';
        this._cloneErr       = 'none';   this._queryErr  = 'none';
        this._adoptedNodes   = null;

        this._container = document.createElement('div');
        document.body.appendChild(this._container);

        // Cria Fragment com vários filhos
        this._frag = document.createDocumentFragment();
        const tags = ['p', 'span', 'div', 'em', 'strong'];
        tags.forEach((tag, i) => {
            const el = document.createElement(tag);
            el.textContent = `fragment-child-${i}`;
            el.setAttribute('data-idx', String(i));
            this._frag.appendChild(el);
        });
        this._frag.appendChild(document.createTextNode('text-canary'));

        this._childCountPre = this._frag.childNodes.length;   // 6
        this._fragOwner     = this._frag.ownerDocument === document ? 'same-doc' : 'other';
        this._nodeText      = this._frag.firstChild?.textContent ?? 'null';

        await new Promise(r => setTimeout(r, 0));
    },

    trigger: async function() {
        // Adota todos os filhos do Fragment para o container
        // Após appendChild(fragment), o fragment fica VAZIO
        this._container.appendChild(this._frag);
        this._adoptedNodes = Array.from(this._container.childNodes);
        this._childCountPost = this._frag.childNodes.length;  // deve ser 0

        void document.body.offsetWidth;

        // Operações sobre Fragment vazio (C++ pode ter estado stale)
        try {
            const clone = this._frag.cloneNode(true);
            this._cloneErr = clone.childNodes.length === 0 ? 'empty-clone' : `children:${clone.childNodes.length}`;
        } catch(e) { this._cloneErr = e.constructor.name; }

        // querySelector sobre Fragment vazio
        try {
            const found = this._frag.querySelector('p');
            this._queryErr = found === null ? 'null-ok' : `found:${found.tagName}`;
        } catch(e) { this._queryErr = e.constructor.name; }

        // Tenta re-inserir no Fragment após adoção
        try {
            const newEl = document.createElement('mark');
            newEl.textContent = 're-insert-test';
            this._frag.appendChild(newEl);
        } catch(_) {}

        // Tenta inserir o Fragment vazio novamente (double-adopt)
        try {
            this._container.appendChild(this._frag);
        } catch(_) {}

        await new Promise(r => setTimeout(r, 0));
    },

    probe: [
        // [0-3] estado do Fragment após adoção — sempre number
        s => s._childCountPre,    // 6 (baseline)
        s => s._childCountPost,   // 0 após adoção
        s => s._frag.childNodes.length,   // deve continuar 0 ou 1 (re-insert)
        s => s._adoptedNodes?.length ?? -1,

        // [4-7] strings do Fragment stale
        s => s._frag.ownerDocument === document ? 'same-doc' : 'other',
        s => s._fragOwner,        // baseline
        s => s._cloneErr,
        s => s._queryErr,

        // [8-10] nós adotados estão no container?
        s => String(s._adoptedNodes?.[0]?.isConnected ?? 'null'),
        s => s._adoptedNodes?.[0]?.textContent ?? 'null',
        s => s._adoptedNodes?.[0]?.getAttribute('data-idx') ?? 'null',

        // [11-13] Fragment firstChild (pré-baseline vs pós-trigger)
        s => s._frag.firstChild?.textContent ?? 'null',
        s => s._nodeText,         // baseline
        s => String(s._container.isConnected),
    ],

    cleanup: async function() {
        this._container?.remove();
        this._container    = null; this._frag = null; this._adoptedNodes = null;
        this._childCountPre = -1;  this._childCountPost = -1;
        this._fragOwner    = 'pending'; this._nodeText = 'pending';
        this._cloneErr     = 'none';   this._queryErr  = 'none';
    }
};
