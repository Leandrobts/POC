import { log } from './utils.mjs';

var grooming_stash = [];

// EXPORTAÇÃO EXPLÍCITA
export function prepare_checkerboard_heap(size) {
    log(`HEAP: Preparando 0x${size.toString(16)}...`);
    grooming_stash = [];
    
    let temp = [];
    // Aloca 2000 buffers
    for(let i=0; i<2000; i++) {
        temp.push(new ArrayBuffer(size));
    }
    
    // Libera alternado para criar buracos
    for(let i=0; i<temp.length; i+=2) {
        temp[i] = null;
    }
    
    grooming_stash = temp.filter(x => x !== null);
    log("HEAP: Pronto.", "success");
}

// Função auxiliar necessária para limpeza
export function clear_heap() {
    grooming_stash = [];
}
