/**
 * CENÁRIO: WEAKMAP_EPHEMERON_UAF
 * Superfície C++: WeakMapImpl.cpp / EphemeronTable / Heap.cpp (sweeping phase)
 * Risco: HIGH
 *
 * Diferença para a versão genérica:
 *   - Versão anterior usava apenas 1 par chave/valor e não tinha como
 *     observar o estado durante o sweeping do GC.
 *   - Versão robusta usa múltiplos pares e uma FinalizationRegistry
 *     (se disponível) para observar quando as chaves são coletadas.
 *   - Adiciona WeakRef para criar referência fraca para o valor — permite
 *     verificar se o valor foi coletado ANTES da entrada do WeakMap
 *     (desync na EphemeronTable = UAF candidate).
 *   - Testa WeakSet além do WeakMap — superfície adicional com ponteiro
 *     para EphemeronTable compartilhada.
 *   - Ciclo de 10 pares chave/valor para maximizar chance de timing.
 */

export default {
    id:       'WEAKMAP_EPHEMERON_UAF',
    category: 'CoreJS',
    risk:     'HIGH',
    description:
        'WeakMap com múltiplos pares + FinalizationRegistry para observar sweeping. ' +
        'WeakRef nos valores detecta desync: valor coletado antes da entrada do WeakMap. ' +
        'WeakSet adicional compartilha EphemeronTable. ' +
        '10 pares maximizam a janela de timing durante o GC.',

    setup: function() {
        this.wm = new WeakMap();
        this.ws = new WeakSet();
        this.finLog = [];

        // FinalizationRegistry — callback quando a chave é coletada
        try {
            this.registry = new FinalizationRegistry(token => {
                this.finLog.push({ collected: token, time: Date.now() });
            });
        } catch(e) {}

        // 10 pares chave/valor
        this.valueRefs = [];  // WeakRefs para os valores
        this.keys = [];       // Refs fortes temporárias para as chaves

        for (let i = 0; i < 10; i++) {
            const key   = { id: i, data: new ArrayBuffer(1024) };
            const value = [i * 1.1, i * 2.2, i * 3.3, i * 4.4]; // array de doubles

            this.wm.set(key, value);
            this.ws.add(key);

            // WeakRef para o valor — nos permite verificar se foi coletado
            try {
                this.valueRefs.push(new WeakRef(value));
            } catch(e) {
                this.valueRefs.push(null);
            }

            // Registra finalizer para a chave
            try {
                this.registry?.register(key, `key_${i}`);
            } catch(e) {}

            this.keys.push(key);
        }

        // Guarda uma das chaves para probes (vai ser zerada no trigger)
        this.probeKey = this.keys[0];
    },

    trigger: function() {
        // Zera todas as refs fortes para as chaves
        // O GC do executor vai coletar as chaves e acionar os ephemerons
        this.keys = null;
        // Nota: probeKey ainda mantém a chave[0] viva intencionalmente
        // para testar o caminho "chave ainda viva, mas outras mortas"
    },

    probe: [
        // Testa has() com a chave ainda viva (probeKey)
        s => s.wm.has(s.probeKey),
        s => s.ws.has(s.probeKey),
        s => s.wm.get(s.probeKey),

        // Verifica se o valor ainda está acessível via WeakRef
        // Se o valor foi coletado ANTES da entrada do WeakMap, há desync
        s => s.valueRefs[0]?.deref()?.length,
        s => s.valueRefs[0]?.deref()?.[0],
        s => s.valueRefs[1]?.deref()?.length,
        s => s.valueRefs[5]?.deref()?.length,
        s => s.valueRefs[9]?.deref()?.length,

        // Quantas chaves foram finalizadas (FinalizationRegistry)
        s => s.finLog.length,
        s => s.finLog.map(e => e.collected).join(','),

        // Tenta has() com a chave zerda — TypeError ou false
        s => { try { return s.wm.has(null); } catch(e) { return e.constructor.name; } },
        s => { try { return s.wm.has(undefined); } catch(e) { return e.constructor.name; } },
    ],

    cleanup: function() {
        try { this.registry?.cleanupSome?.(); } catch(e) {}
        this.wm       = null;
        this.ws       = null;
        this.probeKey = null;
        this.valueRefs = null;
        this.finLog   = null;
    }
};
