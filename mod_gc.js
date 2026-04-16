/**
 * MOD_GC.JS — Estratégias de pressão de memória para PS4 WebKit
 *
 * Princípio: O JSC usa um GC geracional (Nursery → Eden → Old Gen).
 * Para garantir que um objeto freed é realmente coletado, precisamos
 * pressionar cada geração de forma incremental — sem crashar o tab.
 *
 * Limites seguros para o PS4 (~512MB disponível para o browser process):
 *   light  → ~1.5MB   (apenas nursery flush)
 *   medium → ~6MB     (nursery + eden)
 *   heavy  → ~24MB    (3 rounds — força major GC cycle)
 */

export const GC = {

    /**
     * Leve: limpa apenas a Young Generation (nursery).
     * Use após operações rápidas de free que não sobrevivem à nursery.
     */
    light: async function() {
        let buf = [];
        for (let i = 0; i < 50; i++)
            buf.push(new ArrayBuffer(32 * 1024)); // 50 × 32KB = 1.6MB
        buf = null;
        await new Promise(r => setTimeout(r, 2)); // yield pro event loop → GC roda
    },

    /**
     * Médio: pressiona nursery + eden generation.
     * Use na maioria dos cenários UAF depois do trigger.
     */
    medium: async function() {
        let buf = [];
        for (let i = 0; i < 100; i++)
            buf.push(new ArrayBuffer(64 * 1024)); // 100 × 64KB = 6.4MB
        buf = null;

        // String heap separada (força coleta do JSString heap)
        let s = "A";
        for (let i = 0; i < 16; i++) s += s; // ~65KB
        s = null;

        await new Promise(r => setTimeout(r, 8));
    },

    /**
     * Pesado: 3 rounds incrementais para forçar um major GC cycle completo.
     * Evita alocar tudo de uma vez (risco de OOM).
     * Use para objetos que promoviram para a Old Generation.
     */
    heavy: async function() {
        for (let round = 0; round < 3; round++) {
            let buf = [];
            for (let i = 0; i < 80; i++)
                buf.push(new ArrayBuffer(100 * 1024)); // 80 × 100KB = 8MB / round
            buf = null;
            await new Promise(r => setTimeout(r, 15));
        }
    }
};
