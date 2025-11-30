import { log } from './utils.mjs';

var grooming_stash = [];

export function prepare_heap() {
    log("HEAP: Preparando Checkerboard (0x400)...");
    grooming_stash = [];
    
    let temp = [];
    // Aloca 2000 buffers de 1024 bytes
    for(let i=0; i<2000; i++) {
        temp.push(new ArrayBuffer(0x400));
    }
    
    // Cria buracos (Libera 1 a cada 2)
    for(let i=0; i<temp.length; i+=2) {
        temp[i] = null;
    }
    
    grooming_stash = temp.filter(x => x !== null);
    log("HEAP: Pronto.", "success");
}
