/**
 * SC_TREEWALKER_CONFUSION.JS
 * Categoria : DOM — Type Confusion / Use-After-Free
 * Alvo      : WebCore::TreeWalker / NodeFilter C++ lifecycle
 * Técnica   : Cria um TreeWalker, começa a iterar, e muta o DOM
 *             enquanto o walker está posicionado sobre o nó. Remove
 *             o nó atual do walker e observa o que currentNode retorna.
 *             Também testa o NodeFilter callback com modificação de árvore.
 * Referência: WebKit TreeWalker mutation-during-traversal UAF
 */

export default {
    id:          'TREEWALKER_TYPE_CONFUSION',
    category:    'DOM',
    risk:        'HIGH',
    description: 'TreeWalker posicionado sobre nó que é removido do DOM. '
                + 'Testa currentNode stale e type confusion no NodeFilter.',

    /* ── estado interno ──────────────────────────────────────────────── */
    _container:    null,
    _walker:       null,
    _removedNode:  null,
    _filterCalls:  0,
    _filterNodes:  [],
    _traversal:    [],

    supported: function() {
        return typeof document.createTreeWalker !== 'undefined';
    },

    /* ── setup ──────────────────────────────────────────────────────── */
    setup: async function() {
        this._filterCalls = 0;
        this._filterNodes = [];
        this._traversal   = [];
        this._removedNode = null;

        this._container = document.createElement('div');
        this._container.id = 'tw-root';

        // Árvore profunda
        const tags = ['section', 'article', 'p', 'span', 'em', 'strong', 'b', 'i'];
        let cur = this._container;
        for (const tag of tags) {
            const child = document.createElement(tag);
            child.textContent = `node-${tag}`;
            child.setAttribute('data-tw', tag);
            cur.appendChild(child);
            cur = child;
        }

        // Adiciona nós de texto e comentários
        this._container.appendChild(document.createTextNode('text-canary'));
        this._container.appendChild(document.createComment('comment-canary'));

        document.body.appendChild(this._container);

        // Cria TreeWalker com NodeFilter que modifica o DOM
        const self = this;
        this._walker = document.createTreeWalker(
            this._container,
            NodeFilter.SHOW_ALL,
            {
                acceptNode(node) {
                    self._filterCalls++;
                    self._filterNodes.push(node.nodeName);
                    return NodeFilter.FILTER_ACCEPT;
                }
            }
        );

        void this._container.offsetWidth;
        await new Promise(r => setTimeout(r, 0));
    },

    /* ── trigger ─────────────────────────────────────────────────────── */
    trigger: async function() {
        // Avança o walker até o meio da árvore
        let steps = 0;
        while (steps < 3 && this._walker.nextNode()) {
            this._traversal.push(this._walker.currentNode?.nodeName);
            steps++;
        }

        // Remove o currentNode enquanto o walker está posicionado sobre ele
        this._removedNode = this._walker.currentNode;
        try {
            this._removedNode?.remove();
        } catch(_) {}

        // Força relayout
        void this._container.offsetWidth;

        // Continua a travessia — o walker deve lidar com o nó removido
        try {
            while (this._walker.nextNode() && this._traversal.length < 20) {
                this._traversal.push(this._walker.currentNode?.nodeName ?? 'null');
            }
        } catch(_) {}

        // Tenta voltar ao nó removido via previousNode
        try {
            this._walker.previousNode();
        } catch(_) {}

        await new Promise(r => setTimeout(r, 0));
    },

    /* ── probes ──────────────────────────────────────────────────────── */
    probe: [
        // [0-4] currentNode após remoção
        s => s._walker.currentNode?.nodeName ?? 'null',
        s => s._walker.currentNode?.isConnected ?? 'null',
        s => s._walker.currentNode === s._removedNode,
        s => typeof s._walker.currentNode,
        s => s._walker.root === s._container,

        // [5-8] nó removido via referência direta
        s => s._removedNode?.isConnected ?? 'null',
        s => s._removedNode?.nodeName    ?? 'null',
        s => s._removedNode?.parentNode  ?? 'null',
        s => s._removedNode?.nodeType    ?? -1,

        // [9-11] travessia
        s => s._traversal.length,
        s => s._traversal.includes('null'),    // 'null' = nó fantasma
        s => s._filterCalls,

        // [12-13] container intacto
        s => s._container.isConnected,
        s => s._container.childNodes.length,

        // [14-18] nodes do filtro — todos devem ser nomes válidos de tag/nó
        s => s._filterNodes[0]  ?? 'null',
        s => s._filterNodes[2]  ?? 'null',
        s => s._filterNodes[5]  ?? 'null',
        s => s._filterNodes.includes(null) ? 'ghost-node' : 'clean',
        s => s._filterNodes.length,
    ],

    /* ── cleanup ─────────────────────────────────────────────────────── */
    cleanup: async function() {
        this._container?.remove();
        this._container   = null;
        this._walker      = null;
        this._removedNode = null;
        this._filterCalls = 0;
        this._filterNodes = [];
        this._traversal   = [];
    }
};
