/**
 * MOD_EXECUTOR.JS — Orquestrador Maestro de UAF & OOB
 * Versão: 10.0 (Modo Burn-in Infinito)
 * * Funcionalidades:
 * - Loop Contínuo de Ciclos (Stress Test)
 * - Deteção de Out-Of-Bounds (OOB) via JSArray Butterfly
 * - Oráculo de Tempo (Timing Attacks)
 * - Oráculo de GC (Deteção de Objetos Fantasma)
 * - Filtros Cirúrgicos Anti-Ruído para PS4
 */

import { GC }      from './mod_gc.js';
import { Mutator } from './mod_mutator.js';
import { Groomer } from './mod_groomer.js';

// 🚨 Oráculo de Garbage Collection: Sente quando o C++ apaga a memória nativa
export const GCOracle = {
    freedTags: new Set(),
    registry: typeof FinalizationRegistry !== 'undefined' 
        ? new FinalizationRegistry(tag => GCOracle.freedTags.add(tag)) 
        : null,
    reset: function() { this.freedTags.clear(); }
};

export const Executor = {
    isRunning: false, // Controlo do loop infinito

    /**
     * Pára a execução após o término do cenário atual.
     */
    stop: function() {
        this.isRunning = false;
    },

    /**
     * Executa os cenários em loop contínuo até ser interrompido.
     */
    run: async function*(scenarios) {
        this.isRunning = true;
        let testCount = 0;
        let cycleCount = 1;

        while (this.isRunning) {
            for (let scenario of scenarios) {
                if (!this.isRunning) break;

                yield { type: 'STATUS', target: `Ciclo ${cycleCount} | ${scenario.category} > ${scenario.id}` };
                yield {
                    type: 'SCENARIO_START',
                    id:   scenario.id,
                    risk: scenario.risk,
                    desc: scenario.description
                };

                try {
                    GCOracle.reset(); 

                    // ── FASE 1: BASELINE (Estado Original)
                    await scenario.setup?.call(scenario);
                    const baseline = await this.captureBaseline(scenario);

                    // ── FASE 2: GROOM A & OOB VICTIMS
                    // Espalha ArrayBuffers (UAF) e JSArrays (OOB) à volta do alvo
                    let slotsA = Mutator.groomAll(Mutator.CANARY_A, 32);
                    let oobVictims = Mutator.groomOOB(2000); 

                    // ── FASE 3: TRIGGER FREE
                    await scenario.trigger?.call(scenario);

                    // ── FASE 4: GC MEDIUM (Pressiona o motor)
                    yield { type: 'GC_TICK' };
                    await GC.medium();

                    // ── FASE 5: RELEASE A (Cria buracos no heap)
                    slotsA = null;
                    await GC.light();

                    // ── FASE 6: GROOM B (Tenta ocupar os buracos)
                    let slotsB = Mutator.groomAll(Mutator.CANARY_B, 32);

                    // ── FASE 7 + 8: PROBE & DETECT
                    for (let i = 0; i < scenario.probe.length; i++) {
                        testCount++;
                        if (testCount % 4 === 0) yield { type: 'TICK', count: testCount };

                        const result = this.runProbe(scenario, scenario.probe[i], i, baseline);

                        // 1. Verifica Corrupção Bruta (Write-After-Free)
                        const corruption = Mutator.checkCorruption(slotsB, Mutator.CANARY_B);
                        if (corruption.corrupted && !result.wafDetected) {
                            result.anomaly     = true;
                            result.wafDetected = true;
                            result.reason = (result.reason ?? '') + ` | ⚠ WRITE-AFTER-FREE: ${corruption.hex}`;
                        }

                        // 2. Verifica Transbordo de Array (OOB / Butterfly)
                        const oobCheck = Mutator.scanOOB(oobVictims);
                        if (oobCheck.corrupted && !result.wafDetected) {
                            result.anomaly = true;
                            result.wafDetected = true;
                            result.reason = (result.reason ?? '') + ` | ${oobCheck.reason}`;
                        }

                        // 3. Verifica Vazamento de Ponteiros (Info Leak)
                        const ptrs = Mutator.scanForPointers(slotsB);
                        if (ptrs.length > 0) {
                            result.anomaly  = true;
                            result.ptrLeaks = ptrs;
                            result.reason   = (result.reason ?? '') + ` | 🔍 PTR LEAK DETECTADO!`;
                        }

                        if (result.anomaly) {
                            yield { type: 'ANOMALY', risk: scenario.risk, ...result };
                        }
                    }

                    // Cleanup do Ciclo
                    slotsB = null;
                    oobVictims = null;
                    Groomer.cleanup();
                    await scenario.cleanup?.call(scenario);

                } catch(fatalErr) {
                    yield { type: 'SCENARIO_ERROR', id: scenario.id, error: fatalErr.message };
                }

                yield { type: 'SCENARIO_DONE', id: scenario.id };
            }

            cycleCount++; // Incrementa o ciclo e recomeça a lista
        }

        yield { type: 'FINISHED', count: testCount };
    },

    captureBaseline: async function(scenario) {
        const base = [];
        for (let i = 0; i < scenario.probe.length; i++) {
            try {
                const val = scenario.probe[i](scenario);
                base.push({ ok: true, type: typeof val, repr: String(val).slice(0, 120) });
            } catch(e) {
                base.push({ ok: false, errType: e.constructor.name, repr: e.message });
            }
        }
        return base;
    },

    runProbe: function(scenario, probeFn, idx, baseline) {
        const base = baseline[idx];
        const result = {
            anomaly: false, api: scenario.id, action: `probe[${idx}]`,
            baseline: base.repr, val: null, reason: null, telemetry: null
        };

        try {
            const fnStr = probeFn.toString(); 

            // 🚨 ORÁCULO DE TEMPO: Mede lentidão no acesso C++
            const t0 = performance.now();
            const val  = probeFn(scenario);
            const t1 = performance.now();
            const deltaMs = t1 - t0;

            result.val = String(val).slice(0, 200);

            // Se for muito lento (>5ms) e não for uma leitura de length nativo
            if (base.ok && deltaMs > 5.0 && !fnStr.includes('length')) {
                result.anomaly = true;
                result.telemetry = 'TIMING_ANOMALY';
                result.reason = `[TIMING] Lentidão extrema: ${deltaMs.toFixed(2)}ms. C++ slow path.`;
                return result;
            }

            const ptrCheck = this.checkPointerLeak(val);
            if (ptrCheck) {
                result.anomaly = true;
                result.reason  = ptrCheck;
                return result;
            }

            if (base.ok) {
                // TYPE CONFUSION
                if (typeof val !== base.type) {
                    if (val === null || val === undefined) return result;
                    if (['number', 'boolean', 'string'].includes(base.type)) {
                        result.anomaly = true;
                        result.telemetry = 'TYPE_CONFUSION';
                        result.reason = `[TYPE CONFUSION] Tipo alterado: ${base.type} -> ${typeof val}.`;
                        return result;
                    }
                }

                // BOOLEAN FLIP (Com Filtros Anti-Ruído PS4)
                if (base.type === 'boolean' && typeof val === 'boolean') {
                    // Filtro global: ignora propriedades que naturalmente desconectam no teardown
                    if (fnStr.includes('isConnected')) return result;
                    
                    // Filtros específicos por cenário
                    if (scenario.id === 'IFRAME_DOCWRITE_FRAME_UAF' && [7].includes(idx)) return result;
                    if (scenario.id === 'DOM_EVENT_REMOVED_ELEMENT' && [5, 9, 10, 11, 12, 13].includes(idx)) return result;
                    if (scenario.id === 'TREEWALKER_TYPE_CONFUSION' && [2, 3, 5, 14, 18].includes(idx)) return result;
                    if (scenario.id === 'VIDEO_FULLSCREEN_REMOVE' && [12, 13, 14].includes(idx)) return result;

                    if (val !== (base.repr === 'true')) {
                        result.anomaly = true;
                        result.telemetry = 'BOOLEAN_FLIP';
                        result.reason = `[MEMORY CORRUPTION] Boolean Flip detetado: ${base.repr} -> ${val}.`;
                        return result;
                    }
                }

                // STALE DATA (Mutação Numérica)
                if (base.type === 'number' && typeof val === 'number') {
                    if (!isNaN(val) && !isNaN(parseFloat(base.repr))) {
                        const baseNum = parseFloat(base.repr);
                        if (fnStr.includes('nodeType') || fnStr.includes('nodeName')) return result;
                        if (baseNum !== 0 && val === 0) return result; 
                        
                        if (baseNum !== 0 && Math.abs(val - baseNum) > 1) {
                            result.anomaly = true;
                            result.telemetry = 'STALE_DATA';
                            result.reason = `Leitura de Stale Data: ${base.repr} -> ${val}.`;
                            return result;
                        }
                    }
                }

                // 🚨 ORÁCULO DE GC: Deteção de Objeto Fantasma
                const tag = `${scenario.id}_target`;
                if (GCOracle.freedTags.has(tag)) {
                    result.anomaly = true;
                    result.telemetry = 'CONFIRMED_UAF_GHOST';
                    result.reason = `[GHOST OBJECT] C++ libertou a memória, mas o JS continua a ler o valor: ${val}.`;
                    return result;
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
            if (upper16 === 0x0000n) {
                const addr = bits & 0x0000FFFFFFFFFFFFn;
                if (addr > 0x10000n) return `Ponteiro NaN-boxed: 0x${addr.toString(16)}`;
            }
        }
        if (typeof val === 'bigint' && val !== 0n) {
            const LO = 0x0000100000000000n;
            const HI = 0x0000800000000000n;
            if (val > LO && val < HI) return `Ponteiro BigInt vazar: 0x${val.toString(16)}`;
        }
        return null;
    }
};
