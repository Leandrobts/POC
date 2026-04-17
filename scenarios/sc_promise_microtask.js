/**
 * CENÁRIO: PROMISE_MICROTASK_UAF
 * Superfície C++: JSPromise.cpp / MicrotaskQueue.cpp / JSJob.cpp
 * Risco: HIGH
 *
 * Diferença para a versão genérica:
 *   - Versão anterior resolvia a Promise, apagava a ref e esperava.
 *     O callback .then() geralmente acessa contexto válido pois o
 *     executor mantém ref durante o drain da microtask queue.
 *   - Versão robusta usa cadeia de Promises para criar jobs encadeados
 *     na MicrotaskQueue e testa se jobs posteriores acessam contexto
 *     de jobs anteriores que podem ter sido freed.
 *   - Adiciona race entre resolve() e GC forçado via queueMicrotask()
 *     para pressionar o drainer da fila durante o teardown.
 *   - Testa Promise.all() e Promise.race() — ambos criam objetos C++
 *     PromiseReactionJob com back-pointers para as promises originais.
 */

export default {
    id:       'PROMISE_MICROTASK_UAF',
    category: 'Concurrency',
    risk:     'HIGH',
    description:
        'Cadeia de Promises cria jobs encadeados na MicrotaskQueue C++. ' +
        'Promise.all/race criam PromiseReactionJobs com back-pointers. ' +
        'Race entre resolve() e queueMicrotask() pressiona o drainer durante teardown.',

    setup: function() {
        this.log     = [];
        this.resolvers = [];
        this.promises  = [];

        // Cria cadeia de 5 Promises que passam dados entre si
        for (let i = 0; i < 5; i++) {
            let res;
            const p = new Promise(r => { res = r; });
            this.promises.push(p);
            this.resolvers.push(res);
        }

        // Cada .then() acessa o resultado do step anterior
        this.chainResult = this.promises[0]
            .then(v => { this.log.push({ step: 1, v }); return v * 2; })
            .then(v => { this.log.push({ step: 2, v }); return v + 1; })
            .then(v => { this.log.push({ step: 3, v }); return String(v); })
            .then(v => { this.log.push({ step: 4, v }); return { final: v }; })
            .catch(e => { this.log.push({ step: 'catch', err: e.message }); });

        // Promise.all — cria PromiseReactionJobs para cada promise
        this.allResult = null;
        Promise.all(this.promises.slice(0, 3))
            .then(vals => { this.allResult = vals; })
            .catch(() => {});

        // Promise.race — job que cancela quando qualquer uma resolve
        this.raceResult = null;
        Promise.race(this.promises)
            .then(v => { this.raceResult = v; })
            .catch(() => {});
    },

    trigger: function() {
        // Resolve a primeira promise com um valor
        this.resolvers[0](42);

        // Imediatamente após resolve, apaga refs para as promises e resolvers
        // O C++ ainda mantém refs internas nos PromiseReactionJobs
        this.promises  = null;
        this.resolvers = null;

        // Insere microtask que tenta pressionar o heap durante o drain
        queueMicrotask(() => {
            // Aloca durante a execução da microtask queue
            const trash = [];
            for (let i = 0; i < 10; i++) trash.push(new ArrayBuffer(256 * 1024));
            // trash é coletado imediatamente — pressão sem OOM
        });

        // Resolve as demais promises de forma encadeada
        // (os resolvers foram apagados, então não conseguimos resolver)
        // — isso é intencional: deixa Promise.all() pendente indefinidamente
        // para testar o que acontece com PromiseReactionJobs pendentes
    },

    probe: [
        // Estado da cadeia após execução das microtasks
        s => s.log.length,
        s => s.log[0]?.step,
        s => s.log[0]?.v,
        s => s.log[s.log.length - 1]?.step,

        // Promise.all — deveria estar pendente (não todas resolvidas)
        s => s.allResult,

        // Promise.race — deveria ter resolvido com 42
        s => s.raceResult,

        // chainResult — uma Promise (deve ser objeto Promise)
        s => typeof s.chainResult,
        s => s.chainResult !== null,
    ],

    cleanup: function() {
        this.log        = null;
        this.promises   = null;
        this.resolvers  = null;
        this.chainResult = null;
    }
};
