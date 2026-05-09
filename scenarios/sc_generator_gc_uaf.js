/**
 * SC_GENERATOR_GC_UAF.JS
 * Categoria : JS ENGINE — Use-After-Free (Generator)
 * Alvo      : JSC GeneratorFrame / JSGeneratorObject C++ lifecycle
 * Técnica   : Cria generators que capturam objetos DOM via closure,
 *             pausa em yield, dropa a referência externa ao generator
 *             e pressiona o GC. O GeneratorFrame C++ pode ser
 *             parcialmente coletado enquanto o iterator ainda existe,
 *             causando acesso a variáveis de closure stale no resume().
 * Referência: JSC generator frame GC invariant bug pattern
 */

export default {
    id:          'GENERATOR_GC_UAF',
    category:    'JS ENGINE',
    risk:        'MEDIUM',
    description: 'Generator pausado em yield com closure sobre DOM node. '
                + 'Testa acesso a variáveis de closure stale após GC pressure.',

    _container:   null,
    _node:        null,
    _gen:         null,

    // Strings
    _step1:       'pending',
    _step2:       'pending',
    _step3:       'pending',
    _nodeAfterGC: 'pending',
    _resumeErr:   'none',

    // Numéricos
    _yieldCount:  -1,
    _closureVal:  -1,

    supported: function() {
        try {
            function* t() { yield 1; }
            t().next();
            return true;
        } catch(_) { return false; }
    },

    setup: async function() {
        this._step1 = 'pending'; this._step2 = 'pending';
        this._step3 = 'pending'; this._nodeAfterGC = 'pending';
        this._resumeErr = 'none'; this._yieldCount = 0;
        this._closureVal = -1;

        this._container = document.createElement('div');
        document.body.appendChild(this._container);

        this._node = document.createElement('span');
        this._node.textContent = 'generator-canary';
        this._node.setAttribute('data-val', '1337');
        this._container.appendChild(this._node);

        void this._node.offsetWidth;
        await new Promise(r => setTimeout(r, 0));
    },

    trigger: async function() {
        const capturedNode = this._node;
        const self         = this;

        // Generator que captura o nó DOM e atributos via closure
        function* domGenerator() {
            self._yieldCount++;
            // yield 1: antes de qualquer operação
            yield capturedNode.textContent;

            self._yieldCount++;
            // yield 2: após remoção do nó (nó pode estar coletado)
            yield capturedNode.getAttribute('data-val');

            self._yieldCount++;
            // yield 3: após GC pressure
            yield capturedNode.isConnected;
        }

        this._gen = domGenerator();

        // Passo 1 — antes de remover o nó
        try {
            const r1 = this._gen.next();
            this._step1 = String(r1.value ?? 'null');
        } catch(e) { this._step1 = e.constructor.name; }

        // Remove o nó ENQUANTO o generator está pausado
        this._node.remove();
        void document.body.offsetWidth;

        // Pressão de GC moderada
        let tmp = [];
        for (let i = 0; i < 30; i++) tmp.push(new ArrayBuffer(64 * 1024));
        tmp = null;
        await new Promise(r => setTimeout(r, 10));

        // Passo 2 — resume após remoção e GC
        try {
            const r2 = this._gen.next();
            this._step2 = String(r2.value ?? 'null');
        } catch(e) {
            this._step2    = e.constructor.name;
            this._resumeErr = e.constructor.name;
        }

        // Passo 3 — lê isConnected via closure stale
        try {
            const r3 = this._gen.next();
            this._step3 = String(r3.value ?? 'null');
        } catch(e) {
            this._step3 = e.constructor.name;
        }

        // Lê o nó via referência direta (não via closure)
        this._nodeAfterGC = String(this._node.isConnected);
        this._closureVal  = capturedNode === this._node ? 1 : 0;

        // Finaliza o generator
        try { this._gen.return('done'); } catch(_) {}

        await new Promise(r => setTimeout(r, 0));
    },

    probe: [
        // [0-3] valores retornados em cada yield — sempre string
        s => s._step1,   // 'generator-canary' esperado
        s => s._step2,   // '1337' esperado (lido após remoção)
        s => s._step3,   // 'false' esperado (isConnected=false)
        s => s._resumeErr,

        // [4-6] contadores — sempre number
        s => s._yieldCount,   // 3 esperado
        s => s._closureVal,   // 1 = mesma referência, 0 = closure corrompida

        // [7-9] estado do nó após remoção e GC
        s => s._nodeAfterGC,                       // 'false' esperado
        s => s._node.textContent,                  // 'generator-canary'
        s => s._node.getAttribute('data-val'),     // '1337'

        // [10-12] generator state
        s => { try { return String(s._gen.next().done); } catch(_) { return 'error'; } },
        s => String(s._container.isConnected),
        s => s._container.children.length,
    ],

    cleanup: async function() {
        try { this._gen?.return('cleanup'); } catch(_) {}
        this._container?.remove();
        this._container = null; this._node = null; this._gen = null;
        this._step1 = 'pending'; this._step2 = 'pending'; this._step3 = 'pending';
        this._nodeAfterGC = 'pending'; this._resumeErr = 'none';
        this._yieldCount = -1; this._closureVal = -1;
    }
};
