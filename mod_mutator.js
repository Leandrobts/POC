/**
 * MOD_MUTATOR.JS — Heap Groomer para detecção de UAF e OOB
 * Atualizado: Size classes do DOM, Múltiplos OOBs e Floats granulares.
 */

export const Mutator = {
    CANARY_A: 0x41,
    CANARY_B: 0x42,

    // 🚨 FIX: Adicionado 96, 160 e 192 para cobrir os objetos Node/Element do bmalloc (DOM)
    SIZE_CLASSES: [32, 64, 96, 128, 160, 192, 256, 512, 1024],

    spray: function(size, count, canary) {
        let slots = new Array(count);
        for (let i = 0; i < count; i++) {
            let buf = new ArrayBuffer(size);
            new Uint8Array(buf).fill(canary);
            slots[i] = buf;
        }
        return slots;
    },

    groomAll: function(canary, countPerClass = 64) {
        let slots = [];
        for (let sz of this.SIZE_CLASSES) {
            slots.push(...this.spray(sz, countPerClass, canary));
        }
        return slots;
    },

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
            } catch(e) {}
        }
        return { corrupted: false };
    },

    scanForPointers: function(slots) {
        const found = [];
        for (let buf of slots) {
            if (buf.byteLength < 8) continue;
            try {
                let view = new DataView(buf);
                for (let off = 0; off + 8 <= buf.byteLength; off += 8) {
                    let val = view.getBigUint64(off, true);
                    if (val > 0x0000100000000000n && val < 0x0000800000000000n) {
                        found.push({ offset: off, slotSize: buf.byteLength, val, hex: '0x' + val.toString(16).padStart(16, '0') });
                    }
                }
            } catch(e) {}
        }
        return found;
    },

    groomOOB: function(count = 2000) {
        let victims = new Array(count);
        for (let i = 0; i < count; i++) {
            // Array puro de doubles — mantém fast double array no JSC (sem PropertyTable)
            victims[i] = [1.1111111111111, 2.2222222222222, 3.3333333333333, 4.4444444444444];
        }
        return victims;
    },

    scanOOB: function(victims) {
        let corruptedCount = 0;
        let firstReason = null;

        for (let i = 0; i < victims.length; i++) {
            let arr = victims[i];
            
            if (arr.length !== 4) {
                corruptedCount++;
                if (!firstReason) firstReason = `💥 OOB CONFIRMADO! length de 4 para ${arr.length}`;
            } else if (arr[0] !== 1.1111111111111 || arr[1] !== 2.2222222222222) {
                corruptedCount++;
                if (!firstReason) firstReason = `⚠️ DATA OVERWRITE silencioso no índice [${i}]`;
            }
        }
        
        // 🚨 FIX: Agora reporta o TOTAL de arrays afetados pelo blast radius
        if (corruptedCount > 0) {
            return { corrupted: true, count: corruptedCount, reason: `${firstReason} (Total afetados: ${corruptedCount})` };
        }
        
        return { corrupted: false };
    }
};
