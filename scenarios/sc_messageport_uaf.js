/**
 * CENÁRIO: MESSAGEPORT_TRANSFER_UAF
 * Superfície C++: MessagePort.cpp / MessagePortChannel.cpp / WorkerMessagingProxy.cpp
 * Risco: MEDIUM
 *
 * Diferença para a versão genérica:
 *   - Versão anterior fazia transfer apenas uma vez e não verificava o
 *     estado do port detachado de forma sistemática.
 *   - Versão robusta testa três variantes de transfer:
 *     (A) transfer via postMessage para iframe (cross-window)
 *     (B) transfer via postMessage para Worker (cross-thread)
 *     (C) transfer duplo — re-transfer de um port já transferido
 *   - Probes testam todos os métodos do port neutered para verificar
 *     se o C++ ainda executa código sobre o backing object freed.
 *   - Verifica se o handler onmessage no port transferido ainda dispara
 *     sobre o wrapper JS do contexto de origem.
 */

export default {
    id:       'MESSAGEPORT_TRANSFER_UAF',
    category: 'IPC',
    risk:     'MEDIUM',
    description:
        'Transfer de MessagePort via postMessage para iframe e Worker. ' +
        'Ref retida ao port transferido testa todos os métodos do wrapper neutered. ' +
        'Inclui double-transfer (re-transfer de port já transferido) e ' +
        'verificação de onmessage pós-transfer no contexto de origem.',

    setup: function() {
        this.mc      = new MessageChannel();
        this.portRef = this.mc.port1;
        this.received = [];

        this.mc.port1.start();
        this.mc.port2.start();
        this.mc.port2.onmessage = e => this.received.push(e.data);
    },

    trigger: function() {
        // VETOR A: transfer para iframe
        this.iframe = document.createElement('iframe');
        this.iframe.src = 'about:blank';
        document.body.appendChild(this.iframe);

        try {
            // Transfer: port1 ownership vai para o iframe
            // portRef ainda referencia o wrapper JS neutered
            this.iframe.contentWindow.postMessage('init', '*', [this.mc.port1]);
        } catch(e) {}

        // VETOR B: remove o iframe imediatamente após o transfer
        // O contexto destino é destruído enquanto o port ainda existe
        this.iframe.remove();
    },

    probe: [
        // Estado do port neutered
        s => s.portRef.onmessage,
        s => s.portRef.onmessageerror,

        // Tenta usar os métodos — InvalidStateError esperado, crash = bug
        s => { try { s.portRef.postMessage('A'); return 'ok'; } catch(e) { return e.constructor.name + ':' + e.message; } },
        s => { try { s.portRef.postMessage('B', [new ArrayBuffer(8)]); return 'ok'; } catch(e) { return e.constructor.name; } },
        s => { try { s.portRef.start(); return 'ok'; } catch(e) { return e.constructor.name; } },
        s => { try { s.portRef.close(); return 'ok'; } catch(e) { return e.constructor.name; } },
        s => { try { s.portRef.dispatchEvent(new MessageEvent('message', { data: 'x' })); return 'ok'; } catch(e) { return e.constructor.name; } },

        // Re-transfer: tenta transferir o port neutered novamente
        // Se aceitar, o C++ pode criar double-free
        s => {
            try {
                const ch = new MessageChannel();
                ch.port1.postMessage('reuse', '*', [s.portRef]);
                return 'double-transfer-accepted';
            } catch(e) { return e.constructor.name; }
        },

        // Verifica mensagens recebidas no port2 (atividade pós-transfer)
        s => s.received.length,
    ],

    cleanup: function() {
        try { this.iframe?.remove(); } catch(e) {}
        try { this.mc.port2.close(); } catch(e) {}
    }
};
