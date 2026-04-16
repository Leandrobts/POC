/**
 * MÓDULO 2: MUTATOR (WRITE TRIGGER)
 */

export const Mutator = {
    getPayloads: function() {
        const payloads = [];

        // Offsets básicos para forçar a Race Condition na escrita
        payloads.push({ type: "OFFSET", label: "Offset_00", val: 0 });
        payloads.push({ type: "OFFSET", label: "Offset_08", val: 8 });
        payloads.push({ type: "OFFSET", label: "Offset_16", val: 16 });

        // Payloads clássicos de confusão de conversão JS -> C++
        let holey = [1, 2, 3]; holey[100] = 4;
        payloads.push({ type: "MEMORY", label: "Holey_Array", val: holey });
        payloads.push({ type: "PRIMITIVE", label: "NaN", val: NaN });

        return payloads;
    }
};
