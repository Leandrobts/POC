// Variável global para manter referência
var grooming_stash = [];

function prepare_checkerboard_heap(size) {
    log(`HEAP: Preparando buracos de 0x${size.toString(16)}...`);
    grooming_stash = [];
    
    let temp = [];
    for (let i = 0; i < 2000; i++) {
        let ab = new ArrayBuffer(size);
        temp.push(ab);
    }

    let holes = 0;
    for (let i = 0; i < temp.length; i += 2) {
        temp[i] = null; 
        holes++;
    }
    
    grooming_stash = temp.filter(x => x !== null);
    log(`HEAP: ${holes} buracos criados.`, "success");
}

function clear_heap() {
    grooming_stash = [];
}
