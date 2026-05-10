/**
 * SC_WORKER_TRANSFER_UAF.JS
 * Categoria : WORKERS — Use-After-Free / Info Leak
 * Alvo      : WebCore::WorkerMessagingProxy / SerializedScriptValue C++
 * Técnica   : Transfere ArrayBuffers para um Worker via postMessage,
 *             mantém referência JS aos buffers (que ficam "detached"),
 *             e tenta ler os buffers após o Worker processar a mensagem.
 *             O SerializedScriptValue C++ pode não zerar corretamente
 *             o backing store antes de transferi-lo, permitindo info leak.
 *             Também testa postMessage com objeto circular (deve lançar).
 * Referência: WebKit SerializedScriptValue transfer UAF / info leak
 */

export default {
    id:          'WORKER_TRANSFER_UAF',
    category:    'WORKERS',
    risk:        'HIGH',
    description: 'ArrayBuffer transferido para Worker lido via referência JS stale. '
                + 'Testa zeroing do backing store e info leak via buffer detached.',

    _worker:       null,
    _buf1:         null,
    _buf2:         null,
    _view1:        null,

    // Numéricos
    _byteLen1Pre:  -1,
    _byteLen1Post: -1,
    _firstBytePre: -1,
    _firstBytePost:-1,

    // Strings
    _transferErr:  'none',
    _circularErr:  'none',
    _workerMsg:    'pending',

    supported: function() {
        return typeof Worker !== 'undefined';
    },

    setup: async function() {
        this._buf1 = null; this._buf2 = null; this._view1 = null;
        this._byteLen1Pre  = -1; this._byteLen1Post = -1;
        this._firstBytePre = -1; this._firstBytePost = -1;
        this._transferErr  = 'none'; this._circularErr = 'none';
        this._workerMsg    = 'pending';

        // Cria um Worker mínimo inline via Blob
        const workerCode = `
            self.onmessage = function(e) {
                // Recebe o buffer e envia de volta o comprimento
                const buf = e.data?.buf;
                const len = buf ? buf.byteLength : -1;
                self.postMessage({ received: len });
            };
        `;
        const blob = new Blob([workerCode], { type: 'application/javascript' });
        const url  = URL.createObjectURL(blob);
        try {
            this._worker = new Worker(url);
        } catch(_) {}
        URL.revokeObjectURL(url);

        // Buffer com padrão conhecido (canary)
        this._buf1 = new ArrayBuffer(256);
        const u8   = new Uint8Array(this._buf1);
        for (let i = 0; i < u8.length; i++) u8[i] = i & 0xFF;
        this._view1 = new Uint8Array(this._buf1);

        this._buf2 = new ArrayBuffer(512);
        new Uint8Array(this._buf2).fill(0x42);

        this._byteLen1Pre  = this._buf1.byteLength;
        this._firstBytePre = this._view1[0];   // deve ser 0

        await new Promise(r => setTimeout(r, 0));
    },

    trigger: async function() {
        if (!this._worker) {
            this._transferErr = 'no-worker';
            return;
        }

        // A: Transfere buf1 — fica detached após postMessage
        await new Promise(resolve => {
            this._worker.onmessage = (e) => {
                this._workerMsg = String(e.data?.received ?? 'null');
                resolve();
            };
            this._worker.onerror = () => {
                this._workerMsg = 'worker-error';
                resolve();
            };

            try {
                this._worker.postMessage({ buf: this._buf1 }, [this._buf1]);
                this._transferErr = 'ok';
            } catch(e) {
                this._transferErr = e.constructor.name;
                resolve();
            }

            setTimeout(resolve, 300);   // timeout de segurança
        });

        // Após transfer, buf1 está detached
        this._byteLen1Post  = this._buf1.byteLength;   // deve ser 0

        // Tenta ler via view mantida antes do transfer
        try {
            const v = this._view1[0];
            this._firstBytePost = v ?? -999;
        } catch(_) {
            this._firstBytePost = -1;
        }

        // B: Tenta transferir o mesmo buffer novamente (já detached)
        try {
            this._worker.postMessage({ buf: this._buf1 }, [this._buf1]);
        } catch(e) {
            // DataCloneError ou similar esperado
        }

        // C: Objeto circular — deve lançar DataCloneError
        try {
            const circular = {};
            circular.self = circular;
            this._worker.postMessage(circular);
            this._circularErr = 'no-throw';   // bug se não lançar
        } catch(e) {
            this._circularErr = e.constructor.name;   // 'DataCloneError' esperado
        }

        await new Promise(r => setTimeout(r, 50));
    },

    probe: [
        // [0-3] numéricos
        s => s._byteLen1Pre,    // 256 (baseline)
        s => s._byteLen1Post,   // 0 após transfer (detached)
        s => s._firstBytePre,   // 0 (padrão canary)
        s => s._firstBytePost,  // se != -1 = leu buffer detached (info leak!)

        // [4-7] strings
        s => s._transferErr,
        s => s._circularErr,
        s => s._workerMsg,      // comprimento que o worker recebeu
        s => String(s._buf1.byteLength === 0),   // deve ser 'true'

        // [8-10] view do buffer detached
        s => { try { return s._view1[0] ?? -999; } catch(_) { return -1; } },
        s => { try { return s._view1[127] ?? -999; } catch(_) { return -1; } },
        s => s._view1.buffer === s._buf1 ? 'same-buf' : 'detached',

        // [11] buf2 não transferido deve estar intacto
        s => s._buf2.byteLength,
        s => new Uint8Array(s._buf2)[0],
    ],

    cleanup: async function() {
        try { this._worker?.terminate(); } catch(_) {}
        this._worker = null; this._buf1 = null; this._buf2 = null; this._view1 = null;
        this._byteLen1Pre  = -1; this._byteLen1Post  = -1;
        this._firstBytePre = -1; this._firstBytePost = -1;
        this._transferErr  = 'none'; this._circularErr = 'none';
        this._workerMsg    = 'pending';
    }
};
