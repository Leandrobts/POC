/**
 * MOD_EXECUTOR.JS — Orquestrador do ciclo UAF
 *
 * Implementa o ciclo completo para cada cenário:
 *
 *   FASE 1 — BASELINE   : executa as probes com objeto VIVO, registra comportamento normal
 *   FASE 2 — GROOM A    : spray com canário 0x41 ao redor do objeto alvo
 *   FASE 3 — TRIGGER    : chama scenario.trigger() → libera o objeto nativo
 *   FASE 4 — GC         : pressão de memória para forçar coleta do objeto freed
 *   FASE 5 — RELEASE A  : libera os slots A → cria "buracos" no heap
 *   FASE 6 — GROOM B    : spray com canário 0x42 → tenta ocupar slot freed
 *   FASE 7 — PROBE      : acessa o objeto pós-free via scenario.probe[]
 *   FASE 8 — DETECT     : compara com baseline + verifica canário + scan de ponteiros
 *
 * É um async generator — o chamador usa `for await (let ev of Executor.run(scenarios))`.
 */

import { GC }     from './mod_gc.js';
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
                        result.anomaly = true;
                        result.wafDetected = true;
                        const extra = ` | ⚠ WRITE-AFTER-FREE: slot[${corruption.slotSize}B]`
                            + ` offset=${corruption.offset}`
                            + ` esperado=0x${Mutator.CANARY_B.toString(16)}`
                            + ` encontrado=${corruption.hex}`;
                        result.reason = (result.reason ?? '') + extra;
                    }

                    // Detecção extra: scan de ponteiros nos slots B
                    const ptrs = Mutator.scanForPointers(slotsB);
                    if (ptrs.length > 0) {
                        result.anomaly = true;
                        result.ptrLeaks = ptrs;
                        result.reason = (result.reason ?? '')
                            + ` | 🔍 PONTEIROS NOS SLOTS: ${ptrs.map(p => p.hex).join(', ')}`;
                    }

                    if (result.anomaly) {
                        yield { type: 'ANOMALY', ...result };
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

    // ────────────────────────────────────────────────────────────────
    // Captura comportamento de cada probe com objeto VIVO (baseline)
    // ────────────────────────────────────────────────────────────────
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

    // ────────────────────────────────────────────────────────────────
    // Executa uma probe e compara com baseline para detectar anomalias
    // ────────────────────────────────────────────────────────────────
    runProbe: function(scenario, probeFn, idx, baseline) {
        const base = baseline[idx];
        const result = {
            anomaly:  false,
            api:      scenario.id,
            action:   `probe[${idx}]`,
            baseline: base.repr,
            val:      null,
            reason:   null
        };

        try {
            const val    = probeFn(scenario);
            result.val   = String(val).slice(0, 200);

            // 1. Verifica se parece ponteiro vazado
            const ptrCheck = this.checkPointerLeak(val);
            if (ptrCheck) {
                result.anomaly = true;
                result.reason  = ptrCheck;
                return result;
            }

            // 2. Tipo retornado mudou completamente pós-free
            if (base.ok && typeof val !== base.type && base.type !== 'undefined') {
                result.anomaly = true;
                result.reason  = `Tipo mudou pós-free: era "${base.type}" → agora "${typeof val}".`
                    + ` Possível corrupção de objeto (type confusion).`;
            }

        } catch(e) {
            result.val = `${e.constructor.name}: ${e.message}`;

            // TypeError onde baseline era válido = acesso a objeto C++ freed
            if (e instanceof TypeError && base.ok) {
                result.anomaly = true;
                result.reason  = `TypeError pós-free onde baseline era válido (${base.repr}).`
                    + ` O objeto C++ subjacente foi provavelmente freed → UAF CANDIDATE.`;
            }
            // RangeError pode indicar leitura OOB em objeto corrompido
            else if (e instanceof RangeError) {
                result.anomaly = true;
                result.reason  = `RangeError pós-free → possível OOB read em heap reutilizado.`;
            }
            // SecurityError inesperado pode indicar uso de objeto de outro contexto destroyed
            else if (e instanceof DOMException && e.name === 'SecurityError' && !base.ok) {
                result.anomaly = true;
                result.reason  = `SecurityError pós-free: contexto de origem pode ter mudado → possível UAF de Frame.`;
            }
        }

        return result;
    },

    // ────────────────────────────────────────────────────────────────
    // Verifica se um valor retornado parece ser um ponteiro vazado
    // Heurísticas calibradas para PS4 (FreeBSD AMD64)
    // ────────────────────────────────────────────────────────────────
    checkPointerLeak: function(val) {

        // ── Ponteiro 32-bit em número ──────────────────────────────
        if (typeof val === 'number' && !isNaN(val) && isFinite(val) && val > 0) {
            const u32 = val >>> 0; // interpreta como unsigned 32-bit
            // Faixa de userspace: >64KB, <2GB, alinhado a 4 bytes
            const isAligned    = (u32 & 3) === 0;
            const isUserspace  = u32 > 0x00010000 && u32 < 0x80000000;
            const notSentinel  = ![0x7FFFFFFF, 0xFFFF, 0xFFFFFFFF, 0x10000].includes(u32);

            if (isAligned && isUserspace && notSentinel && u32 > 0x00100000) {
                return `Número parece ponteiro 32-bit (PS4 userspace): 0x${u32.toString(16)}`
                    + ` (alinhado, acima de 1MB) → possível info leak.`;
            }

            // Float64 cujos bits não são NaN/Infinity normais
            // NaN-boxing do JSC: 0x0000xxxxxxxxxxxx = ponteiro encoded
            const buf  = new ArrayBuffer(8);
            new Float64Array(buf)[0] = val;
            const bits = new BigUint64Array(buf)[0];
            // Padrão suspeito: bits que não são nem zero nem NaN canônico
            if (bits > 0x0000FFFFFFFFFFFFn && bits < 0xFFFE000000000000n) {
                return `Float64 com padrão de bits suspeito: 0x${bits.toString(16)}`
                    + ` → possível ponteiro NaN-boxed ou corrupção de JSValue.`;
            }
        }

        // ── Ponteiro 64-bit via BigInt ─────────────────────────────
        if (typeof val === 'bigint' && val !== 0n) {
            // PS4 userspace 64-bit: 0x0000_1000_0000_0000 – 0x0000_7FFF_FFFF_FFFF
            const LO = 0x0000100000000000n;
            const HI = 0x0000800000000000n;
            if (val > LO && val < HI) {
                const hex = '0x' + val.toString(16).padStart(16, '0');
                return `BigInt parece ponteiro PS4 userspace 64-bit: ${hex}`
                    + ` → info leak confirmado (faixa de userspace FreeBSD AMD64).`;
            }
            // Mesmo fora da faixa ideal, BigInt não-zero após free é suspeito
            return `BigInt não-zero capturado pós-free: 0x${val.toString(16)}`
                + ` → valor inesperado, investigar manualmente.`;
        }

        return null;
    }
};
