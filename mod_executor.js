
import { GC } from './mod_gc.js';

export const Executor = {
    blacklist: ['constructor', 'reload', 'location', 'open', 'alert', 'close'],

    run: function*(targets, payloads) {
        let testCount = 0;

        for (let target of targets) {
            let obj = target.instance;
            let props = [];
            try {
                let ownProps = Object.getOwnPropertyNames(obj);
                let protoProps = Object.getOwnPropertyNames(Object.getPrototypeOf(obj));
                props = [...new Set([...ownProps, ...protoProps])]; 
            } catch (e) { continue; }

            for (let prop of props) {
                if (this.blacklist.includes(prop) || prop.startsWith('on')) continue;

                yield { type: 'STATUS', target: `${target.category} > ${target.name}.${prop}` };

                try {
                    let descriptor = Object.getOwnPropertyDescriptor(obj, prop);
                    if (descriptor && descriptor.get) continue; 

                    let member = obj[prop];

                    if (typeof member === 'function') {
                        for (let p of payloads) {
                            try {
                                let result = member.call(obj, p.val);
                                
                                // O GOLPE DO UAF: Imediatamente após o payload, forçamos o GC!
                                GC.force();
                                yield { type: 'GC_TICK' }; // Avisa a UI que o GC rodou

                                let anomaly = this.analyze(prop, result, `CALL [${p.label}]`);
                                if (anomaly) {
                                    yield { type: 'ANOMALY', api: `${target.name}.${prop}`, ...anomaly };
                                }
                            } catch (e) {}
                            testCount++;
                            if (testCount % 5 === 0) yield { type: 'TICK', count: testCount };
                        }
                    } else {
                        let anomaly = this.analyze(prop, member, "GET");
                        if (anomaly) {
                            yield { type: 'ANOMALY', api: `${target.name}.${prop}`, ...anomaly };
                        }
                        testCount++;
                        if (testCount % 5 === 0) yield { type: 'TICK', count: testCount };
                    }
                } catch (e) {}
            }
        }
        yield { type: 'FINISHED', count: testCount };
    },

    analyze: function(prop, val, action) {
        if (/^(is|has|can|should)[A-Z]/.test(prop) && val !== undefined && val !== null && typeof val !== 'boolean') {
            return { action, val, reason: "Type Confusion: C++ retornou não-booleano." };
        }
        if (typeof val === 'number' && val > 0x10000000 && val !== 2147483647 && val !== Infinity) {
            return { action, val: `0x${val.toString(16)}`, reason: "Leak: Endereço bruto capturado!" };
        }
        const expectedNulls = ['get', 'getContext', 'exec', 'match', 'getItem', 'querySelector', 'getElementById'];
        if (val === null && !expectedNulls.includes(prop) && !prop.toLowerCase().includes('element')) {
            return { action, val, reason: "UAF ACIONADO: C++ retornou Null inesperado após o GC." };
        }
        return null;
    }
};
