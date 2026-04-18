/**
 * CENÁRIO: VIDEO_FULLSCREEN_REMOVE (Teste de Isolamento de Travamento)
 * Alvo: Comportamento de teardown implícito ao remover vídeo ativo.
 */

export default {
    id:       'VIDEO_FULLSCREEN_REMOVE',
    category: 'Media',
    risk:     'HIGH',
    description: 'Teste de isolamento: Apenas entra em Fullscreen e remove o vídeo do DOM para verificar se o travamento ocorre no teardown implícito.',

    setup: async function() {
        this.container = document.createElement('div');
        document.body.appendChild(this.container);
        this.video = document.createElement('video');
        this.video.src = 'data:video/mp4;base64,AAAAFGZ0eXBtcDQyAAAAAG1wNDIAAAAIZnJlZQAAAAhtZGF0';
        this.container.appendChild(this.video);

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
            // Entramos em tela cheia
            if (this.video.webkitRequestFullscreen) this.video.webkitRequestFullscreen();
            
            // Aguardamos o PS4 processar a transição
            await new Promise(r => setTimeout(r, 100));

            // 1. FREE: Apagamos o vídeo. 
            // O TESTE ACABA AQUI. Sem spray, sem chamada explícita de exit.
            this.video.remove();

        } catch(e) {}
    },

    probe: [
        s => s.video.readyState,
        s => s.video.videoWidth,
        s => s.video.webkitDecodedFrameCount
    ],

    cleanup: function() {
        try { this.container.remove(); } catch(e) {}
    }
};
