/**
 * MÓDULO 2: MUTATOR & PAYLOAD GENERATOR
 * Objetivo: Fornecer argumentos venenosos para quebrar a ponte JS <-> C++
 * Foco: Side-effects, Type Confusion, Detached Buffers e Holey Arrays.
 */

export const Mutator = {

    // Retorna uma lista de payloads devastadores para cada ciclo de fuzzing
    getPayloads: function() {
        const payloads = [];

        /* ==========================================
           1. EXTREMOS PRIMITIVOS E FALSYS
           Foco: Integer Overflows e Null Pointer Dereferences
           ========================================== */
        payloads.push({ type: "PRIMITIVE", label: "Null", val: null });
        payloads.push({ type: "PRIMITIVE", label: "Undefined", val: undefined });
        payloads.push({ type: "PRIMITIVE", label: "NaN", val: NaN });
        payloads.push({ type: "PRIMITIVE", label: "Int_Max", val: 2147483647 });
        payloads.push({ type: "PRIMITIVE", label: "Int_Min", val: -2147483648 });
        payloads.push({ type: "PRIMITIVE", label: "Double_Max", val: Number.MAX_VALUE });
        // O famoso 0x1337... usado para corromper ponteiros
        payloads.push({ type: "PRIMITIVE", label: "Fake_Pointer", val: 0x13371337 });

        /* ==========================================
           2. SIDE-EFFECTS (A ARMA PRINCIPAL)
           Foco: Alterar o estado do mundo DURANTE a conversão de tipos do C++
           ========================================== */
        
        // Objeto que tenta causar um Shrink no Heap quando avaliado
        payloads.push({
            type: "SIDE_EFFECT",
            label: "ToPrimitive_Shrinker",
            val: {
                [Symbol.toPrimitive]: function(hint) {
                    // Aqui dentro poderíamos tentar esvaziar arrays ou invocar o GC
                    return 0; 
                },
                valueOf: function() { return 1; },
                toString: function() { return "fuzz"; }
            }
        });

        // Objeto que joga um erro nativo para ver se a API lida bem com exceções assíncronas
        payloads.push({
            type: "SIDE_EFFECT",
            label: "Thrower_Object",
            val: {
                valueOf: function() { throw new Error("Mutator Exception"); }
            }
        });

        /* ==========================================
           3. ESTRUTURAS DE MEMÓRIA HOSTIS
           Foco: JSC Butterfly e ArrayBuffers
           ========================================== */

        // Array "Esburacado" (Holey Array). Força o JSC a lidar com espaços vazios na memória.
        let holey = [1, 2, 3];
        holey[100] = 4;
        payloads.push({ type: "MEMORY", label: "Holey_Array", val: holey });

        // Buffer Desanexado (Detached Buffer). 
        // Cria um buffer e o envia por uma MessageChannel invisível. 
        // O buffer original fica "zerado" na memória, mas o ponteiro ainda existe.
        try {
            let ab = new ArrayBuffer(1024);
            let mc = new MessageChannel();
            mc.port1.postMessage(ab, [ab]); // Transfere o ownership do buffer
            payloads.push({ type: "MEMORY", label: "Detached_Buffer", val: ab });
        } catch(e) {}

        // Matriz Gigante para tentar exaurir a alocação de propriedades contíguas
        payloads.push({ type: "MEMORY", label: "Giant_String", val: "A".repeat(1024 * 512) });

        /* ==========================================
           4. PROXIES AGRESSIVOS
           Foco: Confundir APIs de validação de segurança (IsObject, HasProperty)
           ========================================== */
        payloads.push({
            type: "PROXY",
            label: "Evil_Proxy",
            val: new Proxy({}, {
                get: function(target, prop) {
                    if (prop === 'then') return undefined; // Evita travar em Promises
                    return 0x41414141; // Retorna lixo mapeável na memória (AAAA)
                },
                has: function() { return true; } // Mente dizendo que tem todas as propriedades
            })
        });

        return payloads;
    }
};
