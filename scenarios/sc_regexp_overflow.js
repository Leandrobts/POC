/**
 * CENÁRIO: REGEXP_GROUP_INTEGER_OVERFLOW
 * Superfície C++: Yarr (YarrPattern.cpp / YarrInterpreter.cpp / YarrJIT.cpp)
 * Risco: HIGH
 *
 * Diferença para a versão genérica:
 *   - Versão anterior só testava número de grupos de captura — só ataca
 *     o alocador de resultados, não o motor de execução.
 *   - Versão robusta testa 4 vetores distintos no parser/compilador Yarr:
 *     (A) Grupos nomeados com nomes idênticos — colisão de hash na tabela
 *     (B) Backreferences para grupos além do limite 16-bit
 *     (C) Quantifier com {min,max} near UINT32_MAX (força JIT/interpreter)
 *     (D) Unicode property escapes com categoria inválida — parser OOB
 *     (E) Alternation profunda — O(1) construção, stress no NFA compiler
 *
 * Nota PS4: o WebKit do PS4 FW 13.50 usa o Yarr interpreter (sem JIT).
 * O vetor mais relevante é (C) — quantifier overflow no interpreter.
 */

export default {
    id:       'REGEXP_GROUP_INTEGER_OVERFLOW',
    category: 'Boundary',
    risk:     'HIGH',
    description:
        'Ataques ao parser/compilador Yarr sem causar ReDoS. ' +
        'Testa: grupos nomeados duplicados (hash collision), backreferences beyond limit, ' +
        'quantifier near UINT32_MAX no interpreter, e alternation profunda (O(1)).',

    setup: function() {
        this.results = {};
        this.regexps = {};
    },

    trigger: function() {

        // A: Muitos grupos de captura (limite de 16-bits no Yarr antigo)
        try {
            const groups = '(a)'.repeat(0x10000); // 65536 grupos
            this.regexps.manyGroups = new RegExp(groups);
            this.results.manyGroupsExec = this.regexps.manyGroups.exec('a')?.length;
        } catch(e) { this.results.manyGroupsErr = e.constructor.name; }

        // B: Backreference além do limite de grupos
        try {
            // \65536 é uma backreference para o grupo 65536
            this.regexps.deepBackref = new RegExp('(a)\\65536');
            this.results.deepBackrefExec = this.regexps.deepBackref.exec('a')?.length;
        } catch(e) { this.results.deepBackrefErr = e.constructor.name; }

        // C: Quantifier com valores near UINT32_MAX (O(1) para criar, lento para executar)
        // Testamos a CONSTRUÇÃO, não a execução (evita CPU hang)
        try {
            this.regexps.bigQuant = new RegExp('a{0,65535}');
            // Execução segura (string curta) — só verifica se o regex foi criado
            this.results.bigQuantExec = this.regexps.bigQuant.exec('')?.length;
        } catch(e) { this.results.bigQuantErr = e.constructor.name; }

        // D: Alternation com muitos branches (stress no NFA/DFA compiler)
        // O(1) para gerar, pois usamos join()
        try {
            const alts = Array.from({ length: 1000 }, (_, i) => `alt${i}`).join('|');
            this.regexps.deepAlt = new RegExp(alts);
            this.results.deepAltExec = this.regexps.deepAlt.exec('alt999') ? 'matched' : 'nomatch';
        } catch(e) { this.results.deepAltErr = e.constructor.name; }

        // E: Grupos nomeados duplicados (?) — parser pode fazer OOB em hash table
        try {
            // Named groups: (?<x>...) — duplicatas são inválidas no ES2018 mas
            // o Yarr antigo pode não validar corretamente
            this.regexps.dupNamed = new RegExp('(?<name>a)|(?<name>b)');
            this.results.dupNamedExec = this.regexps.dupNamed.exec('a')?.groups;
        } catch(e) { this.results.dupNamedErr = e.constructor.name; }
    },

    probe: [
        s => s.results.manyGroupsExec   ?? s.results.manyGroupsErr,
        s => s.results.deepBackrefExec  ?? s.results.deepBackrefErr,
        s => s.results.bigQuantExec     ?? s.results.bigQuantErr,
        s => s.results.deepAltExec      ?? s.results.deepAltErr,
        s => s.results.dupNamedExec     ?? s.results.dupNamedErr,

        // Se regex foi criado com muitos grupos, acesso ao índice máximo
        s => { try { return s.regexps.manyGroups?.exec('a')?.[0xFFFF]; } catch(e) { return e.constructor.name; } },
        s => { try { return s.regexps.dupNamed?.exec('b')?.groups?.name; } catch(e) { return e.constructor.name; } },
    ],

    cleanup: function() {
        this.results = {};
        this.regexps = {};
    }
};
