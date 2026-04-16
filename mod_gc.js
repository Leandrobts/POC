/**
 * MÓDULO 4: GARBAGE COLLECTOR STRESSOR
 * Objetivo: Forçar o motor JS a limpar a memória heap imediatamente.
 * Uso: Acionado logo após um Mutator tentar corromper uma referência.
 */

export const GC = {
    // Array global para segurar referências temporárias e evitar otimização do compilador
    trashBin: [],

    // Força uma coleta de lixo gerando pressão de alocação
    force: function() {
        try {
            // Cria um buffer enorme rapidamente para esgotar a "Nursery" (memória jovem do JSC)
            // Isso força o motor a rodar o Garbage Collector para liberar espaço.
            for (let i = 0; i < 50; i++) {
                this.trashBin.push(new ArrayBuffer(1024 * 1024 * 2)); // Aloca 2MB por iteração
            }
            
            // Imediatamente remove as referências para que sejam coletadas
            this.trashBin = []; 
            
            // Bônus: Alocação de Strings (Força outro tipo de Heap)
            let s = "FUZZ";
            for(let i = 0; i < 15; i++) { s += s; }
            s = null;
            
        } catch (e) {
            // Se der Out of Memory, o GC foi acionado com sucesso. Limpamos o lixo.
            this.trashBin = [];
        }
    }
};