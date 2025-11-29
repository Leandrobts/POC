import { log } from './utils.mjs';

var stable_heap = [];

// Técnica Lapse: Large Object Space com Double Arrays
export function prepare_heap_grooming() {
    log("HEAP: Iniciando Lapse Grooming...");
    try {
        // Aloca 500MB+ de arrays de doubles para limpar fragmentação
        for (let i = 0; i < 500; i++) {
            let a = new Array(1024 * 16); // 64KB chunks
            for (let j = 0; j < a.length; j++) {
                a[j] = 1.1; // Força representação float (Double)
            }
            stable_heap.push(a);
        }
        log("HEAP: Memória estabilizada e alinhada.", "success");
    } catch (e) {
        log("HEAP ERRO: " + e, "fail");
    }
}
