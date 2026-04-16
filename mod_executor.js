
/**
 * MÓDULO 3: EXECUTOR & ANALYZER (POINTER HUNTER EDITION)
 * Foco: Disparar payloads, forçar o GC, e capturar a metade inferior (Low Bits) 
 * do endereço de memória no milissegundo exato em que a mitigação falha.
 */

import { GC } from './mod_gc.js';

export const Executor = {

    // Evita que o fuzzer entre em loops infinitos ou apague a tela
    blacklist: ['constructor', 'reload', 'location', 'open', 'alert', 'close'],

    // O Motor Principal (Generator Function)
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
                        // FUZZING DE MÉTODOS
                        for (let p of payloads) {
                            try {
                                // 1. O Gatilho (Passa o Offset 0 implicitamente ou o payload hostil)
                                let result = member.call(obj, p.val);
                                
                                // 2. O Estresse (Fragmenta a memória)
                                GC.force();
                                yield { type: 'GC_TICK' }; 

                                // 3. Análise do Retorno
                                let anomaly = this.analyze(prop, result, `CALL [${p.label}]`);
                                
                                if (anomaly) {
                                    // ==========================================
                                    // O CAÇADOR DE PONTEIROS (EXTRAÇÃO LOW BITS)
                                    // ==========================================
                                    // ==========================================
                                    // O MEMORY DUMPER (DESPEJO HEXADECIMAL)
                                    // ==========================================
                                    if (result === 0x7ff80000 && typeof obj.getUint32 === 'function') {
                                        try {
                                            let dump = [];
                                            // Vamos ler 32 bytes da memória corrompida (8 blocos de 4 bytes)
                                            for(let offset = 0; offset < 32; offset += 4) {
                                                let val = obj.getUint32(offset, true);
                                                dump.push("0x" + val.toString(16).padStart(8, '0'));
                                            }
                                            
                                            anomaly.reason += `<br><br><span style="color:#00ffff; font-size:12px; background:#002222; padding:4px; display:block; font-family:monospace;">
                                                [$$$] DUMP DE MEMÓRIA (32 Bytes):<br>
                                                ${dump.join(' | ')}
                                            </span>`;
                                        } catch(e) {
                                            anomaly.reason += `<br><span style="color:#ff8800;">[!] Mitigação fechou a janela de leitura.</span>`;
                                        }
                                    }
                                    // ==========================================
                                    // ==========================================

                                    yield { type: 'ANOMALY', api: `${target.name}.${prop}`, ...anomaly };
                                }
                            } catch (e) {}
                            
                            testCount++;
                            if (testCount % 5 === 0) yield { type: 'TICK', count: testCount };
                        }
                    } else {
                        // FUZZING DE PROPRIEDADES (GET)
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

    // O Analisador Minimizado
    analyze: function(prop, val, action) {
        // Ignora valores padrão para focar nos leaks
        if (val === undefined || val === null || isNaN(val)) return null;

        // Detector de Vazamento de Ponteiro WebKit (NaN-Boxed High Bits)
        if (typeof val === 'number') {
            if (val === 0x7ff80000) {
                return { action, val: `0x7ff80000`, reason: "Leak: Topo do ponteiro capturado! Iniciando extração..." };
            } 
            // Detecta outros leaks numéricos bizarros
            else if (val > 0x10000000 && val !== 2147483647 && val !== Infinity) {
                return { action, val: `0x${val.toString(16)}`, reason: "Leak: Endereço de memória bruto capturado." };
            }
        }

        return null;
    }
};
