/**
 * SC_STRUCTURED_CLONE.JS
 * Categoria : JS ENGINE — Use-After-Free / Type Confusion
 * Alvo      : JSC StructuredClone / ArrayBuffer transfer
 * Técnica   : Usa structuredClone() com transferência de ArrayBuffers
 *             e depois acessa os buffers originais (que devem ficar
 *             "detached"). Testa se o motor permite acesso a buffers
 *             neutered, o que indicaria UAF no backing store.
 *             Também testa SharedArrayBuffer cloning.
 * Referência: WebKit structured clone transfer UAF pattern
 */

export default {
    id:          'STRUCTURED_CLONE_UAF',
    category:    'JS ENGINE',
    risk:        'MEDIUM',
    description: 'structuredClone() com transfer de ArrayBuffer. '
                + 'Verifica acesso a buffer detached pós-transfer (UAF no backing store).',

    /* ── estado interno ──────────────────────────────────────────────── */
    _original:   null,
    _clone:      null,
    _view:       null,
    _sabResult:  null,

    supported: function() {
        return typeof structuredClone !== 'undefined';
    },

    /* ── setup ──────────────────────────────────────────────────────── */
    setup: async function() {
        this._sabResult = null;

        // Buffer original com padrão conhecido
        this._original = new ArrayBuffer(1024);
        const u8 = new Uint8Array(this._original);
        for (let i = 0; i < u8.length; i++) u8[i] = i & 0xFF;

        // View guardada separadamente
        this._view = new Uint8Array(this._original);
        this._clone = null;

        await new Promise(r => setTimeout(r, 0));
    },

    /* ── trigger ─────────────────────────────────────────────────────── */
    trigger: async function() {
        // 1) Clone com transferência — original deve ser detached
        try {
            this._clone = structuredClone(
                { buf: this._original, tag: 'canary' },
                { transfer: [this._original] }
            );
        } catch(e) {
            this._clone = { err: e.constructor.name };
        }

        // 2) Tenta usar MessageChannel para transferência simultânea
        try {
            const buf2 = new ArrayBuffer(512);
            new Uint8Array(buf2).fill(0x42);
            const ch = new MessageChannel();
            ch.port1.postMessage({ buf: buf2 }, [buf2]);
            ch.port1.close();
            ch.port2.close();
        } catch(_) {}

        // 3) SharedArrayBuffer (pode lançar, mas testa o path)
        try {
            const sab   = new SharedArrayBuffer(256);
            const sabClone = structuredClone(sab);
            this._sabResult = sabClone?.byteLength ?? -1;
        } catch(e) {
            this._sabResult = `ERR:${e.constructor.name}`;
        }

        await new Promise(r => setTimeout(r, 0));
    },

    /* ── probes ──────────────────────────────────────────────────────── */
    probe: [
        // [0-3] buffer original deve estar detached
        s => s._original.byteLength,          // deve ser 0 se detached
        s => s._original.detached ?? (s._original.byteLength === 0 ? true : false),
        s => { try { return new Uint8Array(s._original).length; } catch(e) { return -1; } },
        s => s._view.byteLength,              // view do buffer detached

        // [4-6] acesso via view ao buffer detached
        s => { try { return s._view[0]; } catch(e) { return `ERR:${e.constructor.name}`; } },
        s => { try { return s._view[512]; } catch(e) { return `ERR:${e.constructor.name}`; } },
        s => s._view.buffer === s._original,

        // [7-9] clone recebido com o conteúdo correto
        s => s._clone?.buf?.byteLength  ?? -1,
        s => s._clone?.tag             ?? 'null',
        s => { try { return new Uint8Array(s._clone?.buf)[0]; } catch(e) { return -1; } },

        // [10] SAB
        s => s._sabResult,
    ],

    /* ── cleanup ─────────────────────────────────────────────────────── */
    cleanup: async function() {
        this._original  = null;
        this._clone     = null;
        this._view      = null;
        this._sabResult = null;
    }
};
