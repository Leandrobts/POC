import { GCOracle } from '../mod_executor.js';

export default {
    id:       'MESSAGEPORT_TRANSFER_UAF',
    category: 'IPC',
    risk:     'MEDIUM',
    description:
        'Transfer de MessagePort via postMessage para iframe. ' +
        'Ref retida ao port transferido testa todos os métodos do wrapper neutered. ' +
        'O Oráculo avisa se o C++ varrer o port da memória nativa.',

    setup: function() {
        this.mc      = new MessageChannel();
        this.portRef = this.mc.port1;
        this.received = [];

        this.mc.port1.start();
        this.mc.port2.start();
        this.mc.port2.onmessage = e => this.received.push(e.data);

        // 🚨 Oráculo: Registamos o port1 para detetar o "Fantasma"
        if (GCOracle.registry) {
            GCOracle.registry.register(this.mc.port1, `${this.id}_target`);
        }
    },

    trigger: function() {
        this.iframe = document.createElement('iframe');
        this.iframe.src = 'about:blank';
        document.body.appendChild(this.iframe);

        try {
            this.iframe.contentWindow.postMessage('init', '*', [this.mc.port1]);
        } catch(e) {}

        // Destrói o contexto de destino
        this.iframe.remove();
    },

    probe: [
        s => s.portRef.onmessage,
        s => s.portRef.onmessageerror,
        s => { try { s.portRef.postMessage('A'); return 'ok'; } catch(e) { return e.constructor.name + ':' + e.message; } },
        s => { try { s.portRef.postMessage('B', [new ArrayBuffer(8)]); return 'ok'; } catch(e) { return e.constructor.name; } },
        s => { try { s.portRef.start(); return 'ok'; } catch(e) { return e.constructor.name; } },
        s => { try { s.portRef.close(); return 'ok'; } catch(e) { return e.constructor.name; } },
        s => {
            try {
                const ch = new MessageChannel();
                ch.port1.postMessage('reuse', '*', [s.portRef]);
                return 'double-transfer-accepted';
            } catch(e) { return e.constructor.name; }
        },
        s => s.received.length,
    ],

    cleanup: function() {
        try { this.iframe?.remove(); } catch(e) {}
        try { this.mc.port2.close(); } catch(e) {}
    }
};
