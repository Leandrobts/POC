/**
 * MOD_EXECUTOR.JS — Orquestrador Maestro (Versão 12.0 - Desempenho e Precisão)
 * Corrigido: Threshold de 35ms, JSC Internal Pointers, Independência WAF/OOB.
 */

import { GC }      from './mod_gc.js';
import { Mutator } from './mod_mutator.js';
import { Groomer } from './mod_groomer.js';

export const GCOracle = {
    freedTags: new Set(),
    // Nota: FinalizationRegistry não é determinístico, atua apenas como heurística passiva.
    registry: typeof FinalizationRegistry !== 'undefined' 
        ? new FinalizationRegistry(tag => GCOracle.freedTags.add(tag)) 
        : null,
    reset: function() { this.freedTags.clear(); }
};

export const Executor = {
    isRunning: false,
    stop: function() { this.isRunning = false; },

    run: async function*(scenarios) {
        this.isRunning = true;
        let testCount = 0;
        let cycleCount = 1;

        while (this.isRunning) {
            for (let scenario of scenarios) {
                if (!this.isRunning) break;

                yield { type: 'STATUS', target: `Ciclo ${cycleCount} | ${scenario.category} > ${scenario.id}` };
                yield { type: 'SCENARIO_START', id: scenario.id, risk: scenario.risk, desc: scenario.description };

                try {
                    GCOracle.reset(); 
                    await scenario.setup?.call(scenario);
                    
                    // 🚨 FIX: Pré-computando as strings das funções aqui para poupar CPU no loop quente
                    const baseline = await this.captureBaseline(scenario);

                    let slotsA = Mutator.groomAll(Mutator.CANARY_A, 32);
                    let oobVictims = Mutator.groomOOB(2000); 

                    await scenario.trigger?.call(scenario);

                    yield { type: 'GC_TICK' };
                    await GC.medium();

                    slotsA = null;
                    // 🚨 FIX: Yield explicito para garantir que o macro-task queue processe o null antes do GC
                    await new Promise(r => setTimeout(r, 0)); 
                    await GC.light();

                    let slotsB = Mutator.groomAll(Mutator.CANARY_B, 32);

                    for (let i = 0; i < scenario.probe.length; i++) {
                        testCount++;
                        if (testCount % 4 === 0) yield { type: 'TICK', count: testCount };

                        const result = this.runProbe(scenario, scenario.probe[i], i, baseline);

                        // 🚨 FIX: Avaliação INDEPENDENTE de WAF e OOB
                        const corruption = Mutator.checkCorruption(slotsB, Mutator.CANARY_B);
                        if (corruption.corrupted) {
                            result.anomaly = true;
                            result.reason = (result.reason ?? '') + ` | ⚠ WAF: ${corruption.hex}`;
                        }

                        const oobCheck = Mutator.scanOOB(oobVictims);
                        if (oobCheck.corrupted) {
                            result.anomaly = true;
                            result.reason = (result.reason ?? '') + ` | ${oobCheck.reason}`;
                        }

                        const ptrs = Mutator.scanForPointers(slotsB);
                        if (ptrs.length > 0) {
                            result.anomaly  = true;
                            result.reason   = (result.reason ?? '') + ` | 🔍 PTR LEAK!`;
                        }

                        if (result.anomaly) {
                            yield { type: 'ANOMALY', risk: scenario.risk, ...result };
                        }
                    }

                    slotsB = null;
                    oobVictims = null;
                    Groomer.cleanup();
                    await scenario.cleanup?.call(scenario);

                } catch(fatalErr) {
                    yield { type: 'SCENARIO_ERROR', id: scenario.id, error: fatalErr.message };
                }
                yield { type: 'SCENARIO_DONE', id: scenario.id };
            }
            cycleCount++;
        }
        yield { type: 'FINISHED', count: testCount };
    },

    captureBaseline: async function(scenario) {
        const base = [];
        for (let i = 0; i < scenario.probe.length; i++) {
            // Guarda a string da função uma única vez
            let fnStr = scenario.probe[i].toString();
            try {
                const val = scenario.probe[i](scenario);
                base.push({ ok: true, type: typeof val, repr: String(val).slice(0, 120), fnStr });
            } catch(e) {
                base.push({ ok: false, errType: e.constructor.name, repr: e.message, fnStr });
            }
        }
        return base;
    },

    runProbe: function(scenario, probeFn, idx, baseline) {
        const base = baseline[idx];
        const result = { anomaly: false, api: scenario.id, action: `probe[${idx}]`, baseline: base.repr, val: null, reason: null };

        try {
            const t0 = performance.now();
            const val  = probeFn(scenario);
            const t1 = performance.now();
            const deltaMs = t1 - t0;

            try { result.val = String(val).slice(0, 200); } catch(e) { result.val = "[Objeto Sem Representação]"; }

            // 🚨 FIX: Threshold ajustado para 35ms para evitar ruído de reflow do WebKit
            if (base.ok && deltaMs > 35.0 && !base.fnStr.includes('length')) {
                result.anomaly = true;
                result.reason = `[TIMING] Lentidão: ${deltaMs.toFixed(2)}ms.`;
                return result;
            }

            const ptrCheck = this.checkPointerLeak(val);
            if (ptrCheck) {
                result.anomaly = true;
                result.reason  = ptrCheck;
                return result;
            }

            if (base.ok) {
                if (typeof val !== base.type) {
                    if (val === null || val === undefined) return result;
                    if (['number', 'boolean', 'string'].includes(base.type)) {
                        result.anomaly = true;
                        result.reason = `[TYPE CONFUSION] ${base.type} -> ${typeof val}.`;
                        return result;
                    }
                }

// BOOLEAN FLIP (Blindado contra Teardown Natural)
                if (base.type === 'boolean' && typeof val === 'boolean') {
                    // 🚨 FIX: Ignora propriedades e comparações de identidade que mudam naturalmente
                    if (
                        base.fnStr.includes('isConnected') || 
                        base.fnStr.includes('previousNode') || 
                        base.fnStr.includes('===') ||  // Ignora: a === b (identidade mudou porque o objeto foi recriado)
                        base.fnStr.includes('==')
                    ) {
                        return result;
                    }

                    if (val !== (base.repr === 'true')) {
                        result.anomaly = true;
                        result.reason = `[MEMORY CORRUPTION] Boolean Flip: ${base.repr} -> ${val}.`;
                        return result;
                    }
                }

// STALE DATA (Mutação Numérica Nível Sniper)
                if (base.type === 'number' && typeof val === 'number') {
                    if (!isNaN(val) && !isNaN(parseFloat(base.repr))) {
                        const baseNum = parseFloat(base.repr);
                        if (base.fnStr.includes('nodeType') || base.fnStr.includes('nodeName')) return result;
                        
                        // 1. O motor zerou o buffer por segurança (Neutering seguro)
                        if (val === 0) return result; 

                        // 2. É um contador inofensivo a subir a partir do zero
                        if (baseNum === 0 && val > -10000 && val < 10000) return result;

                        // 3. O GATILHO REAL: Salto gigantesco indicando Ponteiro ou lixo da RAM
                        if (Math.abs(val - baseNum) > 10000 || (baseNum === 0 && (val < -10000 || val > 10000))) {
                            result.anomaly = true;
                            result.telemetry = 'STALE_DATA';
                            result.reason = `💥 STALE DATA (INFO LEAK): ${base.repr} -> ${val}`;
                            return result;
                        }
                    }
                }

                const tag = `${scenario.id}_target`;
                if (GCOracle.freedTags.has(tag)) {
                    const safeReturns = ['null', 'undefined', 'ok', 'complete', 'about:blank', 'true', 'false', '', 'none', 'auto'];
                    if (!safeReturns.includes(String(val)) && String(val) !== base.repr) {
                        if (typeof val === 'number') return result; 
                        if (typeof val === 'string' && (val.startsWith('http') || val.includes('REWRITTEN') || val.includes('original') || ['SPAN', '#text'].includes(val))) return result;
                        if (String(val).includes('HTMLParagraphElement')) return result;

                        result.anomaly = true;
                        result.reason = `[GHOST LEAK] JS leu lixo nativo: ${String(val).slice(0, 50)}.`;
                        return result;
                    }
                }
            }

        } catch(e) {
            result.val = `${e.constructor.name}: ${e.message}`;
            if (e instanceof TypeError && base.ok) {
                result.anomaly = true;
                result.reason  = `TypeError pós-free (UAF Candidate).`;
                return result;
            }
        }
        return result;
    },

    checkPointerLeak: function(val) {
        if (typeof val === 'number' && isFinite(val) && !isNaN(val) && val !== 0) {
            const buf = new ArrayBuffer(8);
            new Float64Array(buf)[0] = val;
            const bits = new BigUint64Array(buf)[0];
            const upper16 = bits >> 48n;
            
            // 🚨 FIX: Deteta ponteiros Userspace e PONTEIROS INTERNOS JSC (0xFFFFn)
            if (upper16 === 0x0000n) {
                const addr = bits & 0x0000FFFFFFFFFFFFn;
                if (addr > 0x10000n) return `Ponteiro Userspace Vazado: 0x${addr.toString(16)}`;
            } else if (upper16 === 0xFFFFn) {
                const addr = bits & 0x0000FFFFFFFFFFFFn;
                if (addr > 0x10000n) return `🚨 PONTEIRO INTERNO JSC VAZADO: 0x${addr.toString(16)}`;
            }
        }
        return null;
    }
};
