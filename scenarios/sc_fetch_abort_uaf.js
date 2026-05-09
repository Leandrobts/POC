/**
 * SC_FETCH_ABORT_UAF.JS
 * Categoria : NETWORK — Use-After-Free
 * Alvo      : WebCore::FetchLoader / XMLHttpRequest C++ lifecycle
 * Técnica   : Inicia um Fetch com AbortController, aborta durante o
 *             processamento da resposta e mantém referência ao Response.
 *             O FetchLoader C++ pode ser liberado antes do callback JS
 *             terminar de ler o body. Também testa XHR abort durante
 *             readystatechange para comparar os dois paths.
 * Referência: WebKit FetchLoader abort UAF pattern
 */

export default {
    id:          'FETCH_ABORT_UAF',
    category:    'NETWORK',
    risk:        'MEDIUM',
    description: 'Fetch abortado durante leitura do body mantém referência ao Response C++. '
                + 'Testa FetchLoader e XHR abort com callback stale.',

    _controller:  null,
    _response:    null,

    // Strings
    _fetchState:   'pending',
    _bodyState:    'pending',
    _abortReason:  'none',
    _xhrState:     'pending',
    _xhrReadyState: 'none',

    // Numéricos
    _xhrStatus:    -1,
    _responseType: 'pending',   // string na verdade
    _bodyUsed:     'pending',   // string (boolean)

    supported: function() {
        return typeof fetch !== 'undefined'
            && typeof AbortController !== 'undefined';
    },

    setup: async function() {
        this._fetchState    = 'pending'; this._bodyState    = 'pending';
        this._abortReason   = 'none';   this._xhrState     = 'pending';
        this._xhrReadyState = 'none';   this._xhrStatus    = -1;
        this._responseType  = 'pending'; this._bodyUsed     = 'pending';
        this._response      = null;
        this._controller    = new AbortController();
        await new Promise(r => setTimeout(r, 0));
    },

    trigger: async function() {
        // ── FETCH PATH ────────────────────────────────────────────────
        try {
            // Usa data: URL para evitar rede real e ser determinístico
            const dataUrl = 'data:text/plain;base64,' + btoa('A'.repeat(1024));

            const fetchPromise = fetch(dataUrl, {
                signal: this._controller.signal
            });

            // Aborta IMEDIATAMENTE antes da resposta
            this._controller.abort('uaf-test');

            const res = await fetchPromise;
            this._response    = res;
            this._fetchState  = res.ok ? 'ok' : 'not-ok';
            this._responseType = res.type;
            this._bodyUsed    = String(res.bodyUsed);

            // Tenta ler o body após abort (FetchLoader C++ pode estar free)
            try {
                const text = await res.text();
                this._bodyState = text.length > 0 ? 'read-ok' : 'empty';
            } catch(e) {
                this._bodyState = e.constructor.name;
            }

        } catch(e) {
            this._fetchState = e.constructor.name;   // AbortError esperado
            // Mantém _response null para testar acesso pós-abort
        }

        // ── XHR PATH ──────────────────────────────────────────────────
        await new Promise(resolve => {
            const xhr = new XMLHttpRequest();
            const dataUrl = 'data:text/plain;base64,' + btoa('B'.repeat(512));

            xhr.onreadystatechange = () => {
                this._xhrReadyState = String(xhr.readyState);
                this._xhrStatus     = xhr.status;
                this._xhrState      = xhr.responseText?.length > 0 ? 'has-data' : 'no-data';
            };

            xhr.onabort = () => {
                this._xhrState = 'aborted';
                // Tenta ler responseText após abort — UAF candidato
                try {
                    const t = xhr.responseText;
                    if (t && t.length > 0) this._xhrState = 'read-after-abort';
                } catch(_) {}
                resolve();
            };

            xhr.open('GET', dataUrl, true);
            xhr.send();
            // Aborta logo após o send
            setTimeout(() => xhr.abort(), 0);
            setTimeout(resolve, 500); // timeout de segurança
        });

        // Tenta acessar o Response stale após o fetch ter abortado
        if (this._response) {
            try {
                this._bodyUsed = String(this._response.bodyUsed);
            } catch(e) {
                this._bodyUsed = e.constructor.name;
            }
        }

        await new Promise(r => setTimeout(r, 20));
    },

    probe: [
        // [0-3] fetch state — sempre string
        s => s._fetchState,    // 'AbortError' esperado
        s => s._bodyState,     // 'AbortError' ou 'read-ok' (bug)
        s => s._responseType,  // 'pending' se abortou antes, ou tipo real
        s => s._bodyUsed,      // 'pending' ou 'true'/'false'

        // [4-6] XHR state — sempre string
        s => s._xhrState,      // 'aborted' esperado; 'read-after-abort' = bug
        s => s._xhrReadyState, // '0' após abort
        s => s._abortReason,

        // [7] XHR status — number
        s => s._xhrStatus,     // 0 esperado após abort

        // [8-10] Response object stale — acesso após abort
        s => String(s._response?.bodyUsed ?? 'null'),
        s => String(s._response?.ok       ?? 'null'),
        s => {
            try {
                return s._response?.status?.toString() ?? 'null';
            } catch(e) { return e.constructor.name; }
        },
    ],

    cleanup: async function() {
        try { this._controller?.abort(); } catch(_) {}
        this._controller   = null; this._response     = null;
        this._fetchState   = 'pending'; this._bodyState    = 'pending';
        this._abortReason  = 'none';   this._xhrState     = 'pending';
        this._xhrReadyState = 'none';  this._xhrStatus    = -1;
        this._responseType = 'pending'; this._bodyUsed     = 'pending';
    }
};
