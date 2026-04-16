/**
 * MÓDULO 2: MUTATOR (MEMORY SCANNER)
 * Foco exclusivo: Sondar Offsets em vez de tipos primitivos sujos.
 */

export const Mutator = {
    getPayloads: function() {
        const payloads = [];

        // Sondagem de memória de 8 em 8 bytes (Tamanho de um ponteiro de 64 bits)
        for (let i = 0; i <= 64; i += 8) {
            payloads.push({ type: "OFFSET", label: "Offset_" + i, val: i });
        }

        // Payload que aciona a falha de sincronização (Desanexação)
        try {
            let ab = new ArrayBuffer(1024);
            let mc = new MessageChannel();
            mc.port1.postMessage(ab, [ab]); 
            payloads.push({ type: "TRIGGER", label: "Detached_Buffer", val: ab });
        } catch(e) {}

        return payloads;
    }
};