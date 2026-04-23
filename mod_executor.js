/**
 * MOD_EXECUTOR.JS — Orquestrador do ciclo UAF
 * V8.1 — Heurística de ponteiro corrigida para JSC/PS4
 *
 * Ciclo completo por cenário:
 *   FASE 1 — BASELINE   : probes com objeto VIVO → registra comportamento normal
 *   FASE 2 — GROOM A    : spray com canário 0x41 ao redor do objeto alvo
 *   FASE 3 — TRIGGER    : chama scenario.trigger() → libera o objeto nativo (free)
 *   FASE 4 — GC         : pressão de memória para forçar coleta do slot freed
 *   FASE 5 — RELEASE A  : libera slots A → cria "buracos" no heap
 *   FASE 6 — GROOM B    : spray com canário 0x42 → tenta ocupar slot freed
 *   FASE 7 — PROBE      : acessa objeto pós-free via scenario.probe[]
 *   FASE 8 — DETECT     : compara baseline + verifica canário + scan de ponteiros
 */

import { GC }      from './mod_gc.js';
import { Mutator } from './mod_mutator.js';

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

                // ── FASE 1: BASELINE ──────────────────────────────────────
                await scenario.setup?.call(scenario);
                const baseline = await this.captureBaseline(scenario);

                // ── FASE 2: GROOM A (antes do free) ───────────────────────
                let slotsA = Mutator.groomAll(Mutator.CANARY_A, 32);

                // ── FASE 3: TRIGGER FREE ───────────────────────────────────
                await scenario.trigger?.call(scenario);

                // ── FASE 4: GC MEDIUM ──────────────────────────────────────
                yield { type: 'GC_TICK' };
                await GC.medium();

                // ── FASE 5: LIBERA SLOTS A → cria buracos no heap ─────────
                slotsA = null;
                await GC.light();

                // ── FASE 6: GROOM B (tenta ocupar slot freed) ─────────────
                let slotsB = Mutator.groomAll(Mutator.CANARY_B, 32);

                // ── FASE 7 + 8: PROBE & DETECT ────────────────────────────
                for (let i = 0; i < scenario.probe.length; i++) {

                    testCount++;
                    if (testCount % 4 === 0) yield { type: 'TICK', count: testCount };

                    const result = this.runProbe(scenario, scenario.probe[i], i, baseline);

                    // Detecção extra: corrupção de canário (Write-After-Free)
                    const corruption = Mutator.checkCorruption(slotsB, Mutator.CANARY_B);
                    if (corruption.corrupted && !result.wafDetected) {
                        result.anomaly     = true;
                        result.wafDetected = true;
                        result.reason = (result.reason ?? '')
                            + ` | ⚠ WRITE-AFTER-FREE: slot[${corruption.slotSize}B]`
                            + ` offset=${corruption.offset}`
                            + ` esperado=0x${Mutator.CANARY_B.toString(16)}`
                            + ` encontrado=${corruption.hex}`;
                    }

                    // Detecção extra: scan de ponteiros nos slots B
                    const ptrs = Mutator.scanForPointers(slotsB);
                    if (ptrs.length > 0) {
                        result.anomaly  = true;
                        result.ptrLeaks = ptrs;
                        result.reason   = (result.reason ?? '')
                            + ` | 🔍 PONTEIROS NOS SLOTS: ${ptrs.map(p => p.hex).join(', ')}`;
                    }

                    if (result.anomaly) {
                        yield { type: 'ANOMALY', risk: scenario.risk, ...result };
                    }
                }

                // Cleanup
                slotsB = null;
                await scenario.cleanup?.call(scenario);

            } catch(fatalErr) {
                yield {
                    type:  'SCENARIO_ERROR',
                    id:    scenario.id,
                    error: fatalErr.message
                };
            }

            yield { type: 'SCENARIO_DONE', id: scenario.id };
        }

        yield { type: 'FINISHED', count: testCount };
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Captura comportamento de cada probe com o objeto VIVO (baseline)
    // ─────────────────────────────────────────────────────────────────────────
    captureBaseline: async function(scenario) {
        const base = [];
        for (let i = 0; i < scenario.probe.length; i++) {
            try {
                const val = scenario.probe[i](scenario);
                base.push({
                    ok:   true,
                    type: typeof val,
                    repr: String(val).slice(0, 120)
                });
            } catch(e) {
                base.push({
                    ok:      false,
                    errType: e.constructor.name,
                    repr:    e.message
                });
            }
        }
        return base;
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Executa uma probe e compara com baseline para detectar anomalias
    // ─────────────────────────────────────────────────────────────────────────
   // ─────────────────────────────────────────────────────────────────────────
    // Executa uma probe e compara com baseline para detectar anomalias
    // Foco V8.2: TYPE CONFUSION (Booleans, Nulls, Undefined)
    // ─────────────────────────────────────────────────────────────────────────
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
            // Lemos o texto da função para saber o que está sendo testado
            // Ex: "s => s.video.error?.code"
            const fnStr = probeFn.toString(); 

            const val  = probeFn(scenario);
            result.val = String(val).slice(0, 200);

            // 1. Deteção de Ponteiro
            const ptrCheck = this.checkPointerLeak(val);
            if (ptrCheck) {
                result.anomaly = true;
                result.reason  = ptrCheck;
                return result;
            }

            if (base.ok) {
                // 🚨 TELEMETRIA 1: Unexpected Null / Undefined
                if (base.type !== 'undefined' && base.repr !== 'null') {
                    if (val === null || typeof val === 'undefined') {
                        result.anomaly = true;
                        result.telemetry = 'NULL_UNDEFINED_DROP';
                        result.reason = `[TELEMETRIA] Referência perdida! Esperava ${base.type} (${base.repr}), mas retornou ${val}. O C++ zerou o ponteiro nativo.`;
                        return result;
                    }
                }

                // 🚨 TELEMETRIA 2: Boolean Flip Silencioso
                if (base.type === 'boolean' || base.repr === 'true' || base.repr === 'false') {
                    const baseBool = (base.repr === 'true');
                    if (typeof val === 'boolean' && val !== baseBool) {
                        
                        // 🟢 FILTRO DE RUÍDO: Propriedades que mudam naturalmente com o teardown
                        const ignoreBools = ['isConnected', 'paused', 'ended', 'seeking']; 
                        if (!ignoreBools.some(prop => fnStr.includes(prop))) {
                            result.anomaly = true;
                            result.telemetry = 'BOOLEAN_FLIP';
                            result.reason = `[TELEMETRIA] Boolean Flip! Esperado: ${baseBool}, Recebido: ${val}. Corrupção de memória ou estado zumbi.`;
                            return result;
                        }
                    }
                }

                // 🚨 TELEMETRIA 3: Type Confusion de Primitivos
                if (typeof val !== base.type) {
                    
                    // 🟢 FILTRO DE RUÍDO: MediaError (undefined -> 4)
                    // Especificação do HTML5 dita erro 4 (MEDIA_ERR_SRC_NOT_SUPPORTED) ao limpar a source
                    if (base.type === 'undefined' && val === 4 && fnStr.includes('error')) {
                        return result; // Silencia o falso positivo
                    }

                    result.anomaly = true;
                    result.telemetry = 'TYPE_CONFUSION';
                    result.reason = `[TELEMETRIA] O tipo mudou radicalmente! Esperado: ${base.type}, Encontrado: ${typeof val}. Leitura de memória C++ errada.`;
                    return result;
                }
            }

        } catch(e) {
            result.val = `${e.constructor.name}: ${e.message}`;

            // 🚨 TELEMETRIA 4: InvalidStateError
            if (e.name === 'InvalidStateError' && base.ok) {
                result.anomaly = true;
                result.telemetry = 'INVALID_STATE_ERROR';
                result.reason  = `[TELEMETRIA] InvalidStateError disparado! O wrapper JS tentou usar o backing object C++ que já foi destruído. (Baseline era: ${base.repr})`;
                return result;
            }

            // TypeError
            if (e instanceof TypeError && base.ok) {
                result.anomaly = true;
                result.reason  = `TypeError pós-free onde baseline era válido. UAF CANDIDATE.`;
                return result;
            }
        }

        return result;
    },
    // ─────────────────────────────────────────────────────────────────────────
    // Verifica se um valor retornado parece um ponteiro vazado
    //
    // Heurísticas calibradas para JSC no PS4 (FreeBSD AMD64):
    //
    //   1. NaN-boxed pointer: upper 16 bits = 0x0000, lower 48 bits = endereço.
    //      JSC encodea ponteiros como doubles com bits 48–63 zerados.
    //      Um float legítimo NUNCA tem expoente zero com mantissa grande
    //      (seria um número denormalizado abaixo de 2^-1022, extremamente pequeno).
    //      Floats normais como 1.0, 2.0, 440.0 têm bits 48–63 como expoente
    //      biased (0x3FF, 0x400, 0x407...) — NUNCA 0x0000.
    //
    //   2. NaN com payload de ponteiro: bits de NaN não-canônico.
    //      NaN canônico do x86 SSE = 0xFFF8000000000000 (quiet NaN).
    //      NaN com payload (bits baixos != 0) indica valor suspeito.
    //
    //   3. BigInt 64-bit no range de userspace do PS4/FreeBSD AMD64:
    //      0x0000_1000_0000_0000 – 0x0000_7FFF_FFFF_FFFF
    //
    // O que NÃO flaggar (falsos positivos corrigidos):
    //   0x3ff0000000000000 = 1.0   (expoente 0x3FF ≠ 0x0000)
    //   0x4000000000000000 = 2.0   (expoente 0x400 ≠ 0x0000)
    //   0x407b800000000000 = 440.0 (frequência do Oscillator)
    //   0x4049000000000000 = 50.0  (getBoundingClientRect)
    //   Qualquer float com bits 48–63 entre 0x3C0 e 0x43F é um float normal.
    // ─────────────────────────────────────────────────────────────────────────
    checkPointerLeak: function(val) {

        // ── Float64 finito (não-NaN) ───────────────────────────────────────
        if (typeof val === 'number' && isFinite(val) && !isNaN(val) && val !== 0) {
            const buf  = new ArrayBuffer(8);
            new Float64Array(buf)[0] = val;
            const bits = new BigUint64Array(buf)[0];

            // Upper 16 bits = 0x0000 → NaN-boxed pointer encoding do JSC
            // Floats normais NUNCA têm esses bits zerados (seriam denormalizados < 2^-1022)
            const upper16 = bits >> 48n;
            if (upper16 === 0x0000n) {
                const addr = bits & 0x0000FFFFFFFFFFFFn;
                if (addr > 0x10000n) {
                    return `NaN-boxed pointer (JSC encoding): 0x${bits.toString(16).padStart(16, '0')}`
                        + ` → endereço: 0x${addr.toString(16)}`
                        + ` (float legítimo impossível com upper16=0x0000 e mantissa alta).`;
                }
            }
        }

        // ── NaN com payload (isNaN = true, chegou via JS) ─────────────────
        if (typeof val === 'number' && isNaN(val)) {
            const buf  = new ArrayBuffer(8);
            new Float64Array(buf)[0] = val;
            const bits = new BigUint64Array(buf)[0];

            // NaN canônico do x86 SSE — descarta, é apenas NaN normal
            if (bits === 0xFFF8000000000000n) return null;
            // NaN positivo canônico
            if (bits === 0x7FF8000000000000n) return null;

            // NaN com payload nos bits baixos → suspeito
            const payload = bits & 0x000FFFFFFFFFFFFFn;
            if (payload > 0x10000n) {
                return `NaN não-canônico com payload suspeito: 0x${bits.toString(16).padStart(16, '0')}`
                    + ` → payload=0x${payload.toString(16)}`
                    + ` (possível ponteiro encodado em NaN tag do JSC).`;
            }
        }

        // ── BigInt 64-bit ─────────────────────────────────────────────────
        if (typeof val === 'bigint' && val !== 0n) {
            // Faixa de userspace do PS4 (FreeBSD AMD64 com ASLR)
            // Kernel space começa acima de 0x0000_8000_0000_0000
            const LO = 0x0000100000000000n;
            const HI = 0x0000800000000000n;

            if (val > LO && val < HI) {
                const hex = '0x' + val.toString(16).padStart(16, '0');
                return `BigInt no range de userspace do PS4 (FreeBSD AMD64): ${hex}`
                    + ` → info leak de ponteiro nativo confirmado.`;
            }

            // BigInt fora do range de userspace → não é ponteiro, ignora
            return null;
        }

        return null;
    }
};
