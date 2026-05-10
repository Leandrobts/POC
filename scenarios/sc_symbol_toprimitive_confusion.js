/**
 * SC_SYMBOL_TOPRIMITIVE_CONFUSION.JS
 * Categoria : JS ENGINE — Type Confusion
 * Alvo      : JSC toPrimitive / AbstractValue coercion pipeline
 * Técnica   : Define Symbol.toPrimitive e Symbol.iterator em objetos
 *             que modificam o heap durante a coerção implícita.
 *             O JSC pode assumir o tipo do resultado antes de executar
 *             o trap, causando type confusion se o trap retornar um tipo
 *             diferente do hint. Também testa valueOf() e toString()
 *             que fazem side effects durante operações aritméticas.
 * Referência: JSC AbstractValue type confusion via toPrimitive
 */

export default {
    id:          'SYMBOL_TOPRIMITIVE_CONFUSION',
    category:    'JS ENGINE',
    risk:        'HIGH',
    description: 'Symbol.toPrimitive retornando tipo inesperado durante coerção. '
                + 'Testa type confusion no pipeline AbstractValue do JSC.',

    // Strings
    _addResult:    'pending',
    _cmpResult:    'pending',
    _arrResult:    'pending',
    _jsonResult:   'pending',
    _switchResult: 'pending',

    // Numéricos
    _trapCount:  -1,
    _victim:     null,
    _victimVal:  -1,

    supported: function() {
        return typeof Symbol !== 'undefined'
            && typeof Symbol.toPrimitive !== 'undefined';
    },

    setup: async function() {
        this._addResult    = 'pending'; this._cmpResult  = 'pending';
        this._arrResult    = 'pending'; this._jsonResult = 'pending';
        this._switchResult = 'pending';
        this._trapCount    = 0;
        this._victimVal    = 0xBEEF;

        this._victim = new Float64Array(8);
        this._victim.fill(5.55555555555555);

        await new Promise(r => setTimeout(r, 0));
    },

    trigger: async function() {
        const self = this;

        // A: Objeto com toPrimitive que ignora o hint e retorna tipo errado
        const trapObj = {
            [Symbol.toPrimitive](hint) {
                self._trapCount++;
                // 'number' hint → retorna string (violação do contrato)
                if (hint === 'number') return 'not-a-number';
                // 'string' hint → retorna objeto (viola conversão)
                if (hint === 'string') return { x: 1 };
                // 'default' → retorna array (viola completamente)
                return [1, 2, 3];
            }
        };

        // Operação aritmética — JSC assume hint='number'
        try {
            const r = trapObj + 1;
            this._addResult = String(r);
        } catch(e) { this._addResult = e.constructor.name; }

        // Comparação — JSC assume hint='number'
        try {
            const r = trapObj > 0;
            this._cmpResult = String(r);
        } catch(e) { this._cmpResult = e.constructor.name; }

        // B: valueOf que modifica o próprio objeto durante avaliação
        const mutObj = {
            _count: 0,
            valueOf() {
                self._trapCount++;
                this._count++;
                if (this._count === 1) {
                    // Primeira chamada: altera o prototype
                    Object.setPrototypeOf(this, Array.prototype);
                    return 42;
                }
                // Segunda chamada: agora é Array — retorna comprimento
                return this.length ?? -1;
            }
        };

        try {
            const r1 = mutObj + mutObj;   // chama valueOf duas vezes
            this._arrResult = String(r1);
            this._victimVal = mutObj._count;
        } catch(e) {
            this._arrResult  = e.constructor.name;
            this._victimVal  = -1;
        }

        // C: JSON.stringify com toJSON que lança durante serialização
        const jsonObj = {
            a: 1,
            b: {
                toJSON() {
                    self._trapCount++;
                    throw new TypeError('mid-serialization error');
                }
            },
            c: 3
        };
        try {
            JSON.stringify(jsonObj);
            this._jsonResult = 'no-throw';
        } catch(e) {
            this._jsonResult = e.constructor.name;
        }

        // D: switch com toPrimitive que muta o valor entre casos
        let switchVal = 0;
        const switchObj = {
            [Symbol.toPrimitive]() {
                self._trapCount++;
                return switchVal++;   // retorna 0, depois 1, depois 2...
            }
        };
        try {
            // O motor pode avaliar toPrimitive uma ou mais vezes
            const key = switchObj == 0 ? 'zero'
                      : switchObj == 1 ? 'one'
                      : switchObj == 2 ? 'two'
                      : 'other';
            this._switchResult = key + ':count=' + switchVal;
        } catch(e) {
            this._switchResult = e.constructor.name;
        }

        await new Promise(r => setTimeout(r, 0));
    },

    probe: [
        // [0-4] sempre string
        s => s._addResult,
        s => s._cmpResult,
        s => s._arrResult,
        s => s._jsonResult,
        s => s._switchResult,

        // [5-6] numéricos
        s => s._trapCount,
        s => s._victimVal,

        // [7-9] vítima Float64 — detecta corrupção de heap durante coerção
        s => s._victim[0],
        s => s._victim[4],
        s => s._victim[7],

        // [10] integridade
        s => s._victim.every(v => Math.abs(v - 5.55555555555555) < 1e-10)
             ? 'clean' : 'CORRUPTED',
    ],

    cleanup: async function() {
        this._victim       = null;
        this._addResult    = 'pending'; this._cmpResult  = 'pending';
        this._arrResult    = 'pending'; this._jsonResult = 'pending';
        this._switchResult = 'pending';
        this._trapCount    = -1; this._victimVal = -1;
    }
};
