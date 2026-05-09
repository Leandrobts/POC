/**
 * SC_TREEWALKER_CONFUSION.JS  [v2 — falsos positivos corrigidos]
 *
 * FIX probe[5] — TYPE_CONFUSION string→boolean:
 *   s._removedNode era null no baseline (atribuído só no trigger).
 *   s._removedNode?.isConnected ?? 'null' retornava 'null' (string).
 *   Após trigger, _removedNode existia e isConnected=false (boolean).
 *   O executor via string→boolean = TYPE_CONFUSION falso.
 *   Correção: String() em todas as probes que usam ?. + ?? 'null'
 *   sobre variáveis atribuídas no trigger, para manter tipo string
 *   em baseline e em pós-trigger.
 *
 * Probes afetadas: [5] _removedNode?.isConnected
 *                  [6] _removedNode?.nodeName
 *                  [7] _removedNode?.parentNode
 *                  [8] _removedNode?.nodeType
 */

export default {
    id:          'TREEWALKER_TYPE_CONFUSION',
    category:    'DOM',
    risk:        'HIGH',
    description: 'TreeWalker posicionado sobre nó que é removido do DOM. '
                + 'Testa currentNode stale e type confusion no NodeFilter.',

    _container:    null,
    _walker:       null,
    _removedNode:  null,
    _filterCalls:  0,
    _filterNodes:  [],
    _traversal:    [],

    supported: function() {
        return typeof document.createTreeWalker !== 'undefined';
    },

    setup: async function() {
        this._filterCalls = 0;
        this._filterNodes = [];
        this._traversal   = [];
        this._removedNode = null;

        this._container = document.createElement('div');
        this._container.id = 'tw-root';

        const tags = ['section', 'article', 'p', 'span', 'em', 'strong', 'b', 'i'];
        let cur = this._container;
        for (const tag of tags) {
            const child = document.createElement(tag);
            child.textContent = `node-${tag}`;
            child.setAttribute('data-tw', tag);
            cur.appendChild(child);
            cur = child;
        }

        this._container.appendChild(document.createTextNode('text-canary'));
        this._container.appendChild(document.createComment('comment-canary'));

        document.body.appendChild(this._container);

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

    trigger: async function() {
        let steps = 0;
        while (steps < 3 && this._walker.nextNode()) {
            this._traversal.push(this._walker.currentNode?.nodeName);
            steps++;
        }

        this._removedNode = this._walker.currentNode;
        try { this._removedNode?.remove(); } catch(_) {}

        void this._container.offsetWidth;

        try {
            while (this._walker.nextNode() && this._traversal.length < 20) {
                this._traversal.push(this._walker.currentNode?.nodeName ?? 'null');
            }
        } catch(_) {}

        try { this._walker.previousNode(); } catch(_) {}

        await new Promise(r => setTimeout(r, 0));
    },

    probe: [
        // [0-4] currentNode após remoção
        s => s._walker.currentNode?.nodeName    ?? 'null',
        s => String(s._walker.currentNode?.isConnected ?? 'null'),   // FIX: boolean→string
        s => String(s._walker.currentNode === s._removedNode),
        s => typeof s._walker.currentNode,
        s => String(s._walker.root === s._container),

        // [5-8] FIX: String() em todas as probes de _removedNode
        s => String(s._removedNode?.isConnected ?? 'null'),  // [5] era boolean falso positivo
        s => String(s._removedNode?.nodeName    ?? 'null'),  // [6]
        s => String(s._removedNode?.parentNode  ?? 'null'),  // [7]
        s => String(s._removedNode?.nodeType    ?? -1),      // [8]

        // [9-11] travessia
        s => s._traversal.length,
        s => String(s._traversal.includes('null')),
        s => s._filterCalls,

        // [12-13] container
        s => String(s._container.isConnected),
        s => s._container.childNodes.length,

        // [14-18] nodes do filtro
        s => s._filterNodes[0]  ?? 'null',
        s => s._filterNodes[2]  ?? 'null',
        s => s._filterNodes[5]  ?? 'null',
        s => s._filterNodes.includes(null) ? 'ghost-node' : 'clean',
        s => s._filterNodes.length,
    ],

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
