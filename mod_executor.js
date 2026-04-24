/**
 * MOD_EXECUTOR.JS — Orquestrador do ciclo UAF (Versão Mestre)
 * Combina: Varredura OOB, Timing Oracles, GCOracle e Filtros Cirúrgicos.
 */

import { GC }      from './mod_gc.js';
import { Mutator } from './mod_mutator.js';
import { Groomer } from './mod_groomer.js';

// Oráculo de Garbage Collection
export const GCOracle = {
    freedTags: new Set(),
    registry: typeof FinalizationRegistry !== 'undefined' 
        ? new FinalizationRegistry(tag => GCOracle.freedTags.add(tag)) 
        : null,
    reset: function() { this.freedTags.clear(); }
};

export const Executor = {

    run: async function*(scenarios) {
        let testCount = 0;

        for (let scenario of scenarios) {

            yield { type: 'STATUS', target: `${scenario.category} > ${scenario.id}` };
            yield {
                type: 'SCENARIO_START',
                id:   scenario.id,
                risk: scenario.risk,
                desc: scenario.description
            };

            try {
                GCOracle.reset(); // Limpa o oráculo para o novo cenário

                // ── FASE 1: BASELINE
                await scenario.setup?.call(scenario);
                const baseline = await this.captureBaseline(scenario);

                // ── FASE 2: GROOM A
                let slotsA = Mutator.groomAll(Mutator.CANARY_A, 32);
                let oobVictims = Mutator.groomOOB(2000); 

                // ── FASE 3: TRIGGER FREE
                await scenario.trigger?.call(scenario);

                // ── FASE 4: GC MEDIUM
                yield { type: 'GC_TICK' };
                await GC.medium();

                // ── FASE 5: RELEASE A
                slotsA = null;
                await GC.light();

                // ── FASE 6: GROOM B
                let slotsB = Mutator.groomAll(Mutator.CANARY_B, 32);

                // ── FASE 7 + 8: PROBE & DETECT
                for (let i = 0; i < scenario.probe.length; i++) {
                    testCount++;
                    if (testCount % 4 === 0) yield { type: 'TICK', count: testCount };

                    const result = this.runProbe(scenario, scenario.probe[i], i, baseline);

                    // Detecção WAF via ArrayBuffer
                    const corruption = Mutator.checkCorruption(slotsB, Mutator.CANARY_B);
                    if (corruption.corrupted && !result.wafDetected) {
                        result.anomaly     = true;
                        result.wafDetected = true;
                        result.reason = (result.reason ?? '') + ` | ⚠ WRITE-AFTER-FREE: ${corruption.hex}`;
                    }

                    // Detecção OOB via JSArray Butterfly
                    const oobCheck = Mutator.scanOOB(oobVictims);
                    if (oobCheck.corrupted && !result.wafDetected) {
                        result.anomaly = true;
                        result.wafDetected = true;
                        result.reason = (result.reason ?? '') + ` | ${oobCheck.reason}`;
                    }

                    // Scan de Ponteiros
                    const ptrs = Mutator.scanForPointers(slotsB);
                    if (ptrs.length > 0) {
                        result.anomaly  = true;
                        result.ptrLeaks = ptrs;
                        result.reason   = (result.reason ?? '') + ` | 🔍 PTR LEAK!`;
                    }

                    if (result.anomaly) {
                        yield { type: 'ANOMALY', risk: scenario.risk, ...result };
                    }
                }

                // Cleanup
                slotsB = null;
                oobVictims = null;
                Groomer.cleanup();
                await scenario.cleanup?.call(scenario);

            } catch(fatalErr) {
                yield { type: 'SCENARIO_ERROR', id: scenario.id, error: fatalErr.message };
            }

            yield { type: 'SCENARIO_DONE', id: scenario.id };
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
            anomaly:  false,
            api:      scenario.id,
            action:   `probe[${idx}]`,
            baseline: base.repr,
            val:      null,
            reason:   null,
            telemetry: null
        };

        try {
            const fnStr = probeFn.toString(); 

            // 🚨 ORÁCULO DE TEMPO
            const t0 = performance.now();
            const val  = probeFn(scenario);
            const t1 = performance.now();
            const deltaMs = t1 - t0;

            result.val = String(val).slice(0, 200);

            // Se for muito lento (e não for leitura de length nativo)
            if (base.ok && deltaMs > 5.0 && !fnStr.includes('length')) {
                result.anomaly = true;
                result.telemetry = 'TIMING_ANOMALY';
                result.reason = `[TIMING] Lentidão extrema pós-free: ${deltaMs.toFixed(2)}ms. C++ slow path.`;
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
                    if (typeof val === 'undefined' || val === null) return result; 
                    if (base.type === 'number' || base.type === 'boolean' || base.type === 'string') {
                        result.anomaly = true;
                        result.telemetry = 'TYPE_CONFUSION';
                        result.reason = `[TYPE CONFUSION] Esperado: ${base.type}. Encontrado: ${typeof val}.`;
                        return result;
                    }
                }

               // BOOLEAN FLIP (Filtro Cirúrgico)
                if (base.type === 'boolean' && typeof val === 'boolean') {
                    
                    // 1. Ignora globalmente propriedades DOM que naturalmente ficam false após remoção
                    if (fnStr.includes('isConnected')) return result;
                    
                    // 2. Silencia probes específicas de teardown
                    if (scenario.id === 'IFRAME_DOCWRITE_FRAME_UAF' && [7].includes(idx)) return result;
                    if (scenario.id === 'DOM_EVENT_REMOVED_ELEMENT' && [5, 9, 10, 11, 12, 13].includes(idx)) return result;
                    if (scenario.id === 'TREEWALKER_TYPE_CONFUSION' && [2, 3, 5, 14, 18].includes(idx)) return result;
                    if (scenario.id === 'VIDEO_FULLSCREEN_REMOVE' && [12, 13, 14].includes(idx)) return result;

                    if (val !== (base.repr === 'true')) {
                        result.anomaly = true;
                        result.telemetry = 'BOOLEAN_FLIP';
                        result.reason = `[MEMORY CORRUPTION] Boolean Flip silencioso. Valor alterou de ${base.repr} para ${val}.`;
                        return result;
                    }
                }

                // MUTAÇÃO NUMÉRICA
                if (base.type === 'number' && typeof val === 'number') {
                    if (!isNaN(val) && !isNaN(parseFloat(base.repr))) {
                        const baseNum = parseFloat(base.repr);
                        const ignorarDom = ['nodeType', 'nodeName', 'nodeValue', 'length'];
                        if (ignorarDom.some(p => fnStr.includes(p))) return result;
                        if (baseNum !== 0 && val === 0) return result; 
                        
                        if (baseNum !== 0 && Math.abs(val - baseNum) > 1) {
                            result.anomaly = true;
                            result.telemetry = 'STALE_DATA';
                            result.reason  = `Leitura de Stale Data: baseline=${base.repr} → pós-free=${val}.`;
                            return result;
                        }
                    }
                }

                // 🚨 ORÁCULO DE GC (GHOST OBJECT CHECK)
                const tag = `${scenario.id}_target`;
                if (GCOracle.freedTags.has(tag)) {
                    result.anomaly = true;
                    result.telemetry = 'CONFIRMED_UAF_GHOST';
                    result.reason = `[GHOST OBJECT] O C++ notificou que a memória nativa foi apagada, MAS a variável JS leu o valor com sucesso! UAF Perfeito.`;
                    return result;
                }
            }

        } catch(e) {
            result.val = `${e.constructor.name}: ${e.message}`;
            if (e instanceof TypeError && base.ok) {
                result.anomaly = true;
                result.reason  = `TypeError pós-free onde baseline era válido. UAF CANDIDATE.`;
                return result;
            }
        }

        return result;
    },

    checkPointerLeak: function(val) {
        if (typeof val === 'number' && isFinite(val) && !isNaN(val) && val !== 0) {
            const buf  = new ArrayBuffer(8);
            new Float64Array(buf)[0] = val;
            const bits = new BigUint64Array(buf)[0];
            const upper16 = bits >> 48n;
            if (upper16 === 0x0000n) {
                const addr = bits & 0x0000FFFFFFFFFFFFn;
                if (addr > 0x10000n) return `NaN-boxed pointer (JSC encoding): 0x${addr.toString(16)}`;
            }
        }
        if (typeof val === 'number' && isNaN(val)) {
            const buf  = new ArrayBuffer(8);
            new Float64Array(buf)[0] = val;
            const bits = new BigUint64Array(buf)[0];
            if (bits === 0xFFF8000000000000n || bits === 0x7FF8000000000000n) return null;
            const payload = bits & 0x000FFFFFFFFFFFFFn;
            if (payload > 0x10000n) return `NaN não-canônico com payload suspeito: 0x${payload.toString(16)}`;
        }
        if (typeof val === 'bigint' && val !== 0n) {
            const LO = 0x0000100000000000n;
            const HI = 0x0000800000000000n;
            if (val > LO && val < HI) return `BigInt no range de userspace do PS4: 0x${val.toString(16)}`;
        }
        return null;
    }
};
