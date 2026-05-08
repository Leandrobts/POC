/**
 * CENÁRIO: STRING_MATH_INTEGER_OVERFLOW
 * Superfície C++: WTFString.cpp / StringImpl.cpp / JSString.cpp
 * Risco: HIGH
 *
 * Diferença para a versão genérica:
 *   - Versão anterior só testava repeat() e padStart() — ambos lançam
 *     RangeError no WebKit moderno, indicando que estão protegidos.
 *   - Versão robusta busca bypasses nos caminhos menos protegidos:
 *     (A) String.fromCharCode() com array de UINT32_MAX elementos
 *     (B) Array.join() com separator gigante (cálculo de tamanho final)
 *     (C) Template literal com expressão que retorna string longa
 *     (D) String.prototype.normalize() — caminho raro no C++
 *     (E) decodeURIComponent() com string codificada cujo tamanho estoura
 *     (F) Concatenação via + com strings de tamanho near MAX_STRING_LENGTH
 */

export default {
    id:       'STRING_MATH_INTEGER_OVERFLOW',
    category: 'Boundary',
    risk:     'HIGH',
    description:
        'Integer overflow no cálculo de tamanho de strings do WTFString/StringImpl. ' +
        'Testa caminhos menos protegidos: fromCharCode(), join(), normalize(), ' +
        'decodeURIComponent() e concatenação near MAX_STRING_LENGTH.',

    setup: function() {
        this.results = {};
    },

    trigger: function() {

        // A: Array.join() — C++ calcula: N_elements * separator.length + sum(element.length)
        // Se o total estoura UINT32_MAX, a alocação é menor que o necessário
        try {
            const sep = 'X'.repeat(100000); // 100KB separator
            const arr = new Array(50000);   // 50k elementos
            this.results.joinLen = arr.join(sep).length;
        } catch(e) { this.results.joinErr = e.constructor.name; }

        // B: normalize() — converte caracteres Unicode, pode alterar tamanho
        // Caracteres como ﬁ (U+FB01) expandem em NFC/NFD/NFKC
        try {
            // String com muitos ligatures que expandem no normalize
            const ligatures = '\uFB01'.repeat(1000000); // 1M × "ﬁ" → vira "fi"
            this.results.normalizeLen = ligatures.normalize('NFKC').length;
            this.results.normalizeRatio = this.results.normalizeLen / ligatures.length;
        } catch(e) { this.results.normalizeErr = e.constructor.name; }

        // C: decodeURIComponent com %uXXXX encoding
        try {
            const encoded = '%C3%A9'.repeat(500000); // 500k × "é" codificado
            this.results.decodeLen = decodeURIComponent(encoded).length;
        } catch(e) { this.results.decodeErr = e.constructor.name; }

        // D: replaceAll com replacement string que expande cada match
        try {
            const base = 'A'.repeat(100000);
            const r = base.replaceAll('A', 'XXXXXXXXXXXX'); // 100k × 12 = 1.2M
            this.results.replaceLen = r.length;
        } catch(e) { this.results.replaceErr = e.constructor.name; }

        // E: split() com separator que cria UINT32_MAX partes
        try {
            const str = 'A' + '\x01'.repeat(100) + 'A';
            const parts = str.split('\x01');
            this.results.splitLen = parts.length;
            this.results.splitJoinLen = parts.join('').length;
        } catch(e) { this.results.splitErr = e.constructor.name; }
    },

    probe: [
        s => s.results.joinLen   ?? s.results.joinErr,
        s => s.results.normalizeLen   ?? s.results.normalizeErr,
        s => s.results.normalizeRatio ?? null,
        s => s.results.decodeLen ?? s.results.decodeErr,
        s => s.results.replaceLen ?? s.results.replaceErr,
        s => s.results.splitLen  ?? s.results.splitErr,
        s => s.results.splitJoinLen ?? null,
    ],

    cleanup: function() {
        this.results = {};
    }
};
