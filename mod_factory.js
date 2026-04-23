export const Factory = {
    buildScenarios: function() {
        const list = [];

        // ══════════════════════════════════════════════════════════════
        // 1. RegExp Capture Group Limit (Integer Overflow Real)
        // ══════════════════════════════════════════════════════════════
        list.push({
            id: 'REGEXP_GROUP_INTEGER_OVERFLOW',
            category: 'Boundary',
            risk: 'HIGH',
            description: 'Usa "(a)" para forçar falha. Se retornar array em vez de null, o Yarr C++ transbordou.',
            
            setup: function() {
                this.result = null;
            },
            trigger: function() {
                try {
                    // Exige a letra 'a' 65536 vezes
                    const regex = new RegExp('(a)'.repeat(65536));
                    // Passa apenas uma letra. O correto é falhar (null).
                    this.result = regex.exec('a');
                } catch(e) {
                    this.result = e.constructor.name;
                }
            },
            probe: [
                // Se retornar um número (ex: 65537), confirmamos o 0-day no Yarr!
                s => s.result ? s.result.length : null
            ],
            cleanup: function() {
                this.result = null;
            }
        });

        // ══════════════════════════════════════════════════════════════
        // 2. WeakMap GC Ephemeron Desync (Race Condition Real)
        // ══════════════════════════════════════════════════════════════
        list.push({
            id: 'WEAKMAP_EPHEMERON_UAF',
            category: 'CoreJS',
            risk: 'HIGH',
            description: 'Testa se o GC apaga uma chave viva acidentalmente ao varrer chaves mortas.',

            setup: function() {
                this.wm = new WeakMap();
                
                // Chave que vai MORRER
                this.deadKey = document.createElement('span');
                this.wm.set(this.deadKey, new ArrayBuffer(1024));
                
                // Chave que vai FICAR VIVA
                this.aliveKey = document.createElement('div');
                this.wm.set(this.aliveKey, [1.1, 2.2, 3.3]);
            },
            trigger: function() {
                // Libera apenas a deadKey para acionar a limpeza da Ephemeron Table
                this.deadKey = null;
            },
            probe: [
                // A aliveKey nunca foi zerada! TEM que retornar true.
                // Se o baseline era true e agora é false, a tabela do GC corrompeu.
                s => s.wm.has(s.aliveKey)
            ],
            cleanup: function() {
                this.wm = null;
                this.aliveKey = null;
                this.deadKey = null;
            }
        });

        return list;
    }
};
