/**
 * MOD_EXECUTOR.JS — Orquestrador Maestro (Versão 12.0 - Desempenho e Precisão)
 * Corrigido: Threshold de 35ms, JSC Internal Pointers, Independência WAF/OOB.
 */

import { GC }      from './mod_gc.js';
import { Mutator } from './mod_mutator.js';
import { Groomer } from './mod_groomer.js';

     /**
 * MOD_EXECUTOR.JS — Core Execution Engine (Versão 13.0 - Sniper)
 * Integrando: GCOracle V2, Sniper Telemetry e NaN-Boxing Diagnostics.
 */

// Oráculo para monitorar a coleta de lixo (Garbage Collection)
export const GCOracle = {
    freedTags: new Set(),
    registry: (typeof FinalizationRegistry !== 'undefined') ? new FinalizationRegistry(tag => {
        GCOracle.freedTags.add(tag);
    }) : null
};

export const Executor = {
    isRunning: false,
    shouldStop: false,
    testCount: 0,

    stop: function() {
        this.shouldStop = true;
        this.isRunning = false;
    },

    /**
     * Ciclo principal do Fuzzer
     */
    run: async function* (scenarios) {
        this.isRunning = true;
        this.shouldStop = false;
        this.testCount = 0;

        while (!this.shouldStop) {
            for (const scenario of scenarios) {
                if (this.shouldStop) break;

                this.testCount++;
                yield { type: 'STATUS', target: scenario.id };
                yield { type: 'TICK', count: this.testCount };

                try {
                    // 1. Setup & Baseline
                    scenario.setup();
                    const baselines = scenario.probe.map(p => {
                        const start = performance.now();
                        const val = p(scenario);
                        const end = performance.now();
                        return {
                            repr: String(val),
                            type: typeof val,
                            time: end - start,
                            fnStr: p.toString(),
                            ok: true
                        };
                    });

                    // 2. Trigger (O ataque)
                    if (scenario.trigger.constructor.name === 'AsyncFunction') {
                        await scenario.trigger();
                    } else {
                        scenario.trigger();
                    }

                    // 3. Probing & Telemetria
                    for (let i = 0; i < scenario.probe.length; i++) {
                        const start = performance.now();
                        const val = scenario.probe[i](scenario);
                        const end = performance.now();
                        
                        const result = this.runProbe(scenario, baselines[i], val, end - start);
                        if (result.anomaly) {
                            yield {
                                type: 'ANOMALY',
                                risk: scenario.risk,
                                api: `${scenario.id} — probe[${i}]`,
                                telemetry: result.telemetry,
                                reason: result.reason
                            };
                        }
                    }
                } catch (e) {
                    // Silenciamos erros esperados de execução para não travar o loop
                } finally {
                    scenario.cleanup();
                }
            }
            // Pequena pausa para o Event Loop respirar e o GC agir
            await new Promise(r => setTimeout(r, 10));
        }
    },

    /**
     * Analisador de anomalias (O Radar Sniper)
     */
    runProbe: function(scenario, base, val, deltaMs) {
        const result = { anomaly: false, telemetry: '', reason: '' };
        const valRepr = String(val);
        const valType = typeof val;

        // --- 1. GCOracle: GHOST LEAK (UAF Confirmado) ---
        const tag = `${scenario.id}_target`;
        if (GCOracle.freedTags.has(tag)) {
            // Se o objeto foi coletado mas o tipo mudou radicalmente (não é mais null/undefined)
            if (valType !== base.type && val !== null && val !== undefined && valRepr !== base.repr) {
                result.anomaly = true;
                result.telemetry = 'CONFIRMED_UAF_GHOST';
                result.reason = `[GHOST LEAK] Objeto coletado mutou: ${base.type} -> ${valType}. Valor: ${valRepr.slice(0, 30)}`;
                return result;
            }
        }

        // --- 2. TIMING ANOMALY (PS4 Jaguar Calibration) ---
        const TIMING_THRESHOLD_MS = 150; // Ajustado para o CPU lento do PS4
        const isLayoutProbe = base.fnStr.includes('getBoundingClientRect') 
                           || base.fnStr.includes('offsetWidth')
                           || base.fnStr.includes('getComputedStyle');

        if (base.ok && deltaMs > TIMING_THRESHOLD_MS && !isLayoutProbe) {
            result.anomaly = true;
            result.telemetry = 'TIMING_ANOMALY';
            result.reason = `[ENGINE HANG] Loop bloqueante detectado: ${deltaMs.toFixed(2)}ms`;
            return result;
        }

        
        // --- 3. TYPE CONFUSION & CUSTOM ALERTS ---
        // Se a nossa probe disparou um Alerta Customizado (String com os nossos Emojis)
        const isCustomAlert = valType === 'string' && (val.includes('💥') || val.includes('🏆') || val.includes('LEAK'));
        
        if (isCustomAlert) {
            result.anomaly = true;
            result.telemetry = 'CUSTOM_LEAK';
            result.reason = val; // Imprime a nossa mensagem exata de OOB/Ponteiro!
            return result;
        }

        // Se for uma mudança de tipo real não planeada (O verdadeiro Type Confusion)
        if (valType !== base.type && base.type !== 'undefined' && val !== null) {
            result.anomaly = true;
            result.telemetry = 'TYPE_CONFUSION';
            result.reason = `[TYPE CONFUSION] ${base.type} -> ${valType}. Baseline: ${base.repr} | Pós: ${valRepr}`;
            return result;
        }

        // --- 4. BOOLEAN FLIP (GC Validated) ---
        if (base.type === 'boolean' && valType === 'boolean') {
            const flipped = val !== (base.repr === 'true');
            if (flipped && GCOracle.freedTags.has(tag)) {
                result.anomaly = true;
                result.telemetry = 'BOOLEAN_FLIP';
                result.reason = `[BOOLEAN FLIP + GC] Estado mudou após coleta: ${base.repr} -> ${val}`;
                return result;
            }
        }

        // --- 5. STALE DATA (Info Leaks & NaN-Boxing) ---
        if (base.type === 'number' && valType === 'number' && !isNaN(val)) {
            const baseNum = parseFloat(base.repr);
            
            // Filtro Sniper: Ignora contadores pequenos, foca em saltos de memória ou 0 -> Pointer
            if (Math.abs(val - baseNum) > 10000 || (baseNum === 0 && (val < -10000 || val > 10000))) {
                
                // Análise de NaN-Boxing para identificar o que vazou
                const buf = new ArrayBuffer(8);
                const f64 = new Float64Array(buf);
                const u64 = new BigUint64Array(buf);
                f64[0] = val;
                const bits = u64[0];
                
                const addr = bits & 0x0000FFFFFFFFFFFFn;
                const upper16 = (bits >> 48n) & 0xFFFFn;

                let diagnostic = `Vazamento Numérico: ${base.repr} -> ${val}`;
                
                if (upper16 === 0x0000n && addr > 0x100000n) {
                    diagnostic = `💥 PONTEIRO NATIVO: 0x${addr.toString(16)}`;
                } else if (upper16 === 0xFFFFn) {
                    const intVal = Number(bits & 0xFFFFFFFFn);
                    diagnostic = `💥 JSValue Int32 Interno: 0x${bits.toString(16)} (int=${intVal})`;
                }

                result.anomaly = true;
                result.telemetry = 'STALE_DATA';
                result.reason = diagnostic;
                return result;
            }
        }

        return result;
    }
};
