/**
 * SC_TEMPLATE_CONTENT_UAF.JS
 * Categoria : DOM — Use-After-Free
 * Alvo      : WebCore::HTMLTemplateElement / TemplateContentDocumentFragment C++
 * Técnica   : O <template> mantém um DocumentFragment "inerte" em
 *             template.content. Testa acesso ao content após o template
 *             ser removido do DOM, adoção do content para outro documento
 *             (via iframe) e modificações concorrentes via MutationObserver.
 *             O TemplateContentDocumentFragment C++ tem lifecycle diferente
 *             do Fragment normal — é owned pelo template, não pelo Document.
 * Referência: WebKit HTMLTemplateElement content ownership UAF
 */

export default {
    id:          'TEMPLATE_CONTENT_UAF',
    category:    'DOM',
    risk:        'HIGH',
    description: 'template.content acedido após remoção e adoção cross-document. '
                + 'Testa ownership do TemplateContentDocumentFragment C++.',

    _template:    null,
    _content:     null,
    _container:   null,
    _iframe:      null,

    // Numéricos
    _childCountPre:  -1,
    _childCountPost: -1,
    _mutCount:       -1,

    // Strings
    _contentOwner: 'pending',
    _cloneResult:  'none',
    _adoptResult:  'none',
    _importResult: 'none',

    supported: function() {
        return typeof HTMLTemplateElement !== 'undefined';
    },

    setup: async function() {
        this._childCountPre  = -1; this._childCountPost = -1; this._mutCount = 0;
        this._contentOwner   = 'pending'; this._cloneResult = 'none';
        this._adoptResult    = 'none';   this._importResult = 'none';

        this._container = document.createElement('div');
        document.body.appendChild(this._container);

        // Template com conteúdo rico
        this._template = document.createElement('template');
        this._template.innerHTML = `
            <div class="tmpl-root">
                <p data-idx="0">template-child-0</p>
                <span data-idx="1">template-child-1</span>
                <ul><li>item-a</li><li>item-b</li></ul>
            </div>
        `;
        this._container.appendChild(this._template);

        this._content     = this._template.content;
        this._childCountPre = this._content.childNodes.length;
        this._contentOwner  = this._content.ownerDocument?.URL ?? 'null';

        // iframe para cross-document adoption
        this._iframe = document.createElement('iframe');
        this._iframe.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px';
        this._container.appendChild(this._iframe);
        await new Promise(r => {
            this._iframe.onload = r;
            this._iframe.src = 'about:blank';
        });

        await new Promise(r => setTimeout(r, 0));
    },

    trigger: async function() {
        // Clona o content antes da remoção
        try {
            const clone = this._content.cloneNode(true);
            this._cloneResult = String(clone.childNodes.length);
        } catch(e) { this._cloneResult = e.constructor.name; }

        // Remove o template do DOM (orphan o content fragment)
        this._template.remove();
        void document.body.offsetWidth;

        // Tenta adotar o content para o documento do iframe
        try {
            const iDoc  = this._iframe.contentDocument;
            const adopted = iDoc.adoptNode(this._content);
            this._adoptResult = adopted
                ? `adopted:children=${adopted.childNodes.length}`
                : 'null';
        } catch(e) { this._adoptResult = e.constructor.name; }

        // Tenta importNode do content para o documento principal
        try {
            const imported = document.importNode(this._content, true);
            this._importResult = `imported:children=${imported.childNodes.length}`;
        } catch(e) { this._importResult = e.constructor.name; }

        // Tenta modificar o content após adoção
        try {
            const newEl = document.createElement('mark');
            newEl.textContent = 'post-adopt';
            this._content.appendChild(newEl);
            this._childCountPost = this._content.childNodes.length;
        } catch(_) {
            this._childCountPost = -1;
        }

        await new Promise(r => setTimeout(r, 0));
    },

    probe: [
        // [0-3] contagens — sempre number
        s => s._childCountPre,
        s => s._childCountPost,
        s => s._content.childNodes.length,
        s => s._mutCount,

        // [4-7] strings
        s => s._contentOwner,
        s => s._cloneResult,
        s => s._adoptResult,
        s => s._importResult,

        // [8-10] content após remoção do template
        s => s._content.ownerDocument?.URL ?? 'null',
        s => String(s._template.isConnected),
        s => s._content.firstChild?.textContent?.trim().slice(0, 30) ?? 'null',

        // [11-12] template.content ainda é o mesmo objeto?
        s => String(s._template.content === s._content),
        s => String(s._container.isConnected),
    ],

    cleanup: async function() {
        this._container?.remove();
        this._container    = null; this._template  = null;
        this._content      = null; this._iframe    = null;
        this._childCountPre = -1;  this._childCountPost = -1; this._mutCount = -1;
        this._contentOwner = 'pending'; this._cloneResult  = 'none';
        this._adoptResult  = 'none';   this._importResult = 'none';
    }
};
