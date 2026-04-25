import { Groomer } from '../mod_groomer.js';

export default {
    id:       'FINALIZATION_REGISTRY_DESYNC',
    category: 'CoreJS',
    risk:     'HIGH',
    description:
        'Corrida no Garbage Collector usando FinalizationRegistry. Inundamos o GC ' +
        'com milhares de objetos e apagamo-los simultaneamente. Tentamos capturar ' +
        'um token de registo (heldValue) que foi corrompido durante a Sweeping Phase.',

    setup: function() {
        this.results = { callbacks: 0, corruptedTokens: [] };
        const self = this;

        // Criamos o registo do GC
        this.registry = new FinalizationRegistry(heldValue => {
            self.results.callbacks++;
            // Se o heldValue não for o número original, o motor misturou os ponteiros!
            if (typeof heldValue !== 'number') {
                self.results.corruptedTokens.push(heldValue);
            }
        });

        // Inundamos o registo
        this.targets = [];
        for (let i = 0; i < 5000; i++) {
            let obj = { id: i };
            this.registry.register(obj, i); // heldValue é o número 'i'
            this.targets.push(obj);
        }
    },

    // FIX: Transformado em async para permitir o await
    trigger: async function() {
        this.targets = null;
        
        let trash = Groomer.sprayDOM('span', 2000);
        Groomer.punchHoles(trash, 2);

        // Dá tempo para o GC assíncrono disparar os callbacks no registro
        await new Promise(r => setTimeout(r, 50));
    },

    probe: [
        // Probe 0: O motor C++ já disparou os callbacks de limpeza?
        s => s.results.callbacks,
        
        // Probe 1: O GC misturou os ponteiros da tabela interna?
        s => {
            if (s.results.corruptedTokens.length > 0) {
                // Tentamos transformar o lixo lido num ponteiro Hexadecimal
                let lixo = s.results.corruptedTokens[0];
                return `💥 SUCESSO! Tabela do GC Corrompida. Leu: ${typeof lixo}`;
            }
            return 'GC Limpo e Estável';
        }
    ],

    cleanup: function() {
        this.registry = null;
        this.targets = null;
    }
};
