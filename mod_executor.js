
/**
 * MÓDULO 3: EXECUTOR & ANALYZER (ATOMIC 64-BIT EDITION)
 * Objetivo: Capturar ponteiros reais de 64 bits ignorando a sanitização de memória.
 */

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
                                // Realizamos a chamada passando 'true' para Little-Endian se for DataView
                                let result = member.call(obj, p.val, true);
                                
                                // Gatilho de Pressão de Memória
                                GC.force();
                                yield { type: 'GC_TICK' }; 

                                let anomaly = this.analyze(prop, result, `CALL [${p.label}]`);
                                
                                if (anomaly) {
                                    // ==========================================
                                    // EXTRAÇÃO ATÔMICA DE 64-BITS
                                    // ==========================================
                                    
                                    // Caso 1: O vazamento veio via getFloat64 (Mais comum no WebKit)
                                    if (prop === 'getFloat64' && typeof result === 'number' && !isNaN(result)) {
                                        let buffer = new ArrayBuffer(8);
                                        new Float64Array(buffer)[0] = result;
                                        let view = new BigUint64Array(buffer);
                                        let hexPointer = "0x" + view[0].toString(16).padStart(16, '0');

                                        if (hexPointer.includes('7ff8') || hexPointer.startsWith('0x00003')) {
                                            anomaly.reason += `<br><br><span style="color:#0f0; background:#002200; padding:5px; font-weight:bold; font-size:14px;">[$$$] FLOAT64 LEAK REAL: ${hexPointer}</span>`;
                                        }
                                    }
                                    
                                    // Caso 2: O vazamento veio via getBigUint64
                                    else if (prop === 'getBigUint64' && typeof result === 'bigint') {
                                        let hexPointer = "0x" + result.toString(16).padStart(16, '0');
                                        
                                        if (hexPointer.includes('7ff8') || hexPointer.startsWith('0x00003')) {
                                            anomaly.reason += `<br><br><span style="color:#0f0; background:#002200; padding:5px; font-weight:bold; font-size:14px;">[$$$] BIGINT64 LEAK REAL: ${hexPointer}</span>`;
                                        }
                                    }
                                    // ==========================================

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
        if (val === undefined || val === null) return null;

        // Se o valor for um número muito alto ou o marcador de NaN-Boxing
        if (typeof val === 'number') {
            if (val === 0x7ff80000) {
                return { action, val: `0x7ff80000`, reason: "Header detectado. Aguardando extração de 64 bits..." };
            } 
            else if (val > 0x10000000 && val !== 2147483647 && val !== Infinity) {
                return { action, val: `0x${val.toString(16)}`, reason: "Vazamento de endereço de 32 bits." };
            }
        }
        
        // Se o valor for BigInt (Ponteiro de 64 bits puro)
        if (typeof val === 'bigint') {
            return { action, val: `0x${val.toString(16)}`, reason: "Captura direta de 64 bits via BigInt." };
        }

        return null;
    }
};
