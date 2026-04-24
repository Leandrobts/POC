import { GCOracle } from '../mod_executor.js';

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

        for (let i = 0; i < 5; i++) {
            let res;
            const p = new Promise(r => { res = r; });
            this.promises.push(p);
            this.resolvers.push(res);
            
            // 🚨 Oráculo: Monitoriza a Promise original no C++
            if (GCOracle.registry) GCOracle.registry.register(p, `${this.id}_p${i}`);
        }

        this.chainResult = this.promises[0]
            .then(v => { this.log.push({ step: 1, v }); return v * 2; })
            .then(v => { this.log.push({ step: 2, v }); return v + 1; })
            .then(v => { this.log.push({ step: 3, v }); return String(v); })
            .then(v => { this.log.push({ step: 4, v }); return { final: v }; })
            .catch(e => { this.log.push({ step: 'catch', err: e.message }); });

        this.allResult = null;
        Promise.all(this.promises.slice(0, 3))
            .then(vals => { this.allResult = vals; })
            .catch(() => {});

        this.raceResult = null;
        Promise.race(this.promises)
            .then(v => { this.raceResult = v; })
            .catch(() => {});
    },

    trigger: function() {
        this.resolvers[0](42);

        this.promises  = null;
        this.resolvers = null;

        queueMicrotask(() => {
            const trash = [];
            for (let i = 0; i < 10; i++) trash.push(new ArrayBuffer(256 * 1024));
        });
    },

    probe: [
        s => s.log.length,
        s => s.log[0]?.step,
        s => s.log[0]?.v,
        s => s.log[s.log.length - 1]?.step,
        s => s.allResult,
        s => s.raceResult,
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
