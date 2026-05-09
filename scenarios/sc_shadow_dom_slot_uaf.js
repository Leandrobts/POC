/**
 * SC_SHADOW_DOM_SLOT_UAF.JS
 * Categoria : DOM — Use-After-Free
 * Alvo      : WebCore::HTMLSlotElement / ShadowRoot C++ lifecycle
 * Técnica   : Atribui nós ao slot de um Shadow DOM, remove o host do
 *             DOM e acessa assignedNodes() sobre o slot stale.
 *             O SlotAssignment C++ pode manter referência para os nós
 *             atribuídos mesmo após o host ser coletado.
 * Referência: WebKit Shadow DOM slot assignment lifecycle UAF
 */

export default {
    id:          'SHADOW_DOM_SLOT_UAF',
    category:    'DOM',
    risk:        'HIGH',
    description: 'HTMLSlotElement.assignedNodes() sobre slot stale após remoção do host. '
                + 'Testa ponteiro para SlotAssignment C++ após ShadowRoot liberado.',

    _host:          null,
    _shadow:        null,
    _slot:          null,
    _slotted:       null,
    _container:     null,

    // Numéricos
    _assignedCount: -1,
    _slottedNodes:  -1,

    // Strings
    _slotName:      'pending',
    _hostConnected: 'pending',

    supported: function() {
        return typeof Element !== 'undefined'
            && typeof Element.prototype.attachShadow !== 'undefined';
    },

    setup: async function() {
        this._assignedCount = -1;
        this._slottedNodes  = -1;
        this._slotName      = 'pending';
        this._hostConnected = 'pending';

        this._container = document.createElement('div');
        document.body.appendChild(this._container);

        // Host com Shadow Root
        this._host = document.createElement('div');
        this._shadow = this._host.attachShadow({ mode: 'open' });

        // Slot dentro do shadow
        this._slot = document.createElement('slot');
        this._slot.name = 'uaf-slot';
        this._shadow.appendChild(this._slot);

        // Nós atribuídos ao slot
        this._slotted = document.createElement('span');
        this._slotted.slot = 'uaf-slot';
        this._slotted.textContent = 'slotted-canary';
        this._host.appendChild(this._slotted);

        this._container.appendChild(this._host);
        void this._host.offsetWidth;

        // Captura estado inicial
        this._assignedCount = this._slot.assignedNodes().length;
        this._slotName      = this._slot.name;
        this._hostConnected = String(this._host.isConnected);

        await new Promise(r => setTimeout(r, 0));
    },

    trigger: async function() {
        // Remove o host — libera ShadowRoot e SlotAssignment C++
        this._host.remove();
        void document.body.offsetWidth;

        // Tenta acessar slot de shadow root desconectado
        try {
            this._slottedNodes = this._slot.assignedNodes({ flatten: true }).length;
        } catch(_) {
            this._slottedNodes = -1;
        }

        // Força reatribuição sobre slot órfão
        try {
            const ghost = document.createElement('em');
            ghost.slot = 'uaf-slot';
            this._host.appendChild(ghost); // host está desconectado
        } catch(_) {}

        await new Promise(r => setTimeout(r, 0));
    },

    probe: [
        // [0-3] estado do host após remoção
        s => String(s._host.isConnected),
        s => String(s._host.shadowRoot === s._shadow),
        s => s._host.childNodes.length,
        s => s._hostConnected,   // string baseline para comparar

        // [4-7] slot pós-remoção do host
        s => s._slot.name,
        s => s._slotName,        // baseline para comparar
        s => {
            try { return s._slot.assignedNodes().length; } catch(_) { return -1; }
        },
        s => s._assignedCount,   // contagem baseline

        // [8-10] nó slotted stale
        s => String(s._slotted.isConnected),
        s => s._slotted.textContent,
        s => String(s._slotted.assignedSlot === s._slot),

        // [11] leitura pós-trigger
        s => s._slottedNodes,
    ],

    cleanup: async function() {
        this._container?.remove();
        this._container = null; this._host = null; this._shadow = null;
        this._slot = null; this._slotted = null;
        this._assignedCount = -1; this._slottedNodes = -1;
        this._slotName = 'pending'; this._hostConnected = 'pending';
    }
};
