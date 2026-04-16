/**
 * MÓDULO 2: MUTATOR (COMPREHENSIVE PAYLOADS)
 * Foco: Gerar confusão de tipos (Type Confusion), UAF Triggers e varredura OOB.
 */

export const Mutator = {
    getPayloads: function() {
        const payloads = [];

        // 1. SCAN DE MEMÓRIA (Útil para Buffers e DataViews)
        for (let i = 0; i <= 64; i += 8) {
            payloads.push({ type: "OFFSET", label: "Offset_" + i, val: i });
        }

        // 2. CORRUPÇÃO DE PRIMITIVOS (Type Confusion)
        payloads.push({ type: "PRIMITIVE", label: "NaN", val: NaN });
        payloads.push({ type: "PRIMITIVE", label: "Null", val: null });
        payloads.push({ type: "PRIMITIVE", label: "Infinity", val: Infinity });

        // 3. OBJETOS MALICIOSOS (Força execução de código JS durante chamadas C++)
        let evilObject = {
            valueOf: function() { 
                // Tenta forçar o Garbage Collector no meio da conversão de tipo!
                try { new ArrayBuffer(1024 * 1024 * 10); } catch(e) {}
                return 1337; 
            }
        };
        payloads.push({ type: "EVIL_OBJ", label: "Getter_Hijack", val: evilObject });

        // 4. MEMÓRIA NEUTERIZADA (O clássico UAF)
        try {
            let ab = new ArrayBuffer(1024);
            let mc = new MessageChannel();
            mc.port1.postMessage(ab, [ab]); 
            payloads.push({ type: "UAF", label: "Detached_Buffer", val: ab });
        } catch(e) {}

        // 5. ARRAYS ANÔMALOS
        let holey = [1, 2, 3];
        holey[100] = 4; // Cria um "buraco" gigante na memória
        payloads.push({ type: "ARRAY", label: "Holey_Array", val: holey });

        return payloads;
    }
};