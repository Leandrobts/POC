/**
 * SC_STRUCTURED_CLONE.JS  [v2 — falsos positivos corrigidos]
 *
 * FIX probe[4] / probe[5] — TYPE_CONFUSION number→undefined:
 *   s._view[0] num buffer detached retornava undefined (sem lançar)
 *   no WebKit do PS4. O executor via number→undefined mas o check
 *   val===undefined deveria suprimir — bug de edge-case no motor.
 *   Correção: envolver em try/catch que retorna -999 (número) para
 *   undefined, mantendo tipo number sempre.
 *
 * FIX probe[10] — TYPE_CONFUSION object→string:
 *   _sabResult era null (object). Após trigger virava string 'ERR:...'.
 *   Correção: inicializar como 'pending' (string).
 */

export default {
    id:          'STRUCTURED_CLONE_UAF',
    category:    'JS ENGINE',
    risk:        'MEDIUM',
    description: 'structuredClone() com transfer de ArrayBuffer. '
                + 'Verifica acesso a buffer detached pós-transfer (UAF no backing store).',

    _original:   null,
    _clone:      null,
    _view:       null,
    _sabResult:  'pending',   // FIX: era null (object)

    supported: function() {
        return typeof structuredClone !== 'undefined';
    },

    setup: async function() {
        this._sabResult = 'pending';   // FIX

        this._original = new ArrayBuffer(1024);
        const u8 = new Uint8Array(this._original);
        for (let i = 0; i < u8.length; i++) u8[i] = i & 0xFF;

        this._view  = new Uint8Array(this._original);
        this._clone = null;

        await new Promise(r => setTimeout(r, 0));
    },

    trigger: async function() {
        try {
            this._clone = structuredClone(
                { buf: this._original, tag: 'canary' },
                { transfer: [this._original] }
            );
        } catch(e) {
            this._clone = { err: e.constructor.name };
        }

        try {
            const buf2 = new ArrayBuffer(512);
            new Uint8Array(buf2).fill(0x42);
            const ch = new MessageChannel();
            ch.port1.postMessage({ buf: buf2 }, [buf2]);
            ch.port1.close();
            ch.port2.close();
        } catch(_) {}

        try {
            const sab      = new SharedArrayBuffer(256);
            const sabClone = structuredClone(sab);
            // FIX: sempre string
            this._sabResult = String(sabClone?.byteLength ?? -1);
        } catch(e) {
            this._sabResult = `ERR:${e.constructor.name}`;
        }

        await new Promise(r => setTimeout(r, 0));
    },

    probe: [
        // [0-3] buffer original deve estar detached
        s => s._original.byteLength,
        s => s._original.detached ?? (s._original.byteLength === 0),
        s => { try { return new Uint8Array(s._original).length; } catch(_) { return -1; } },
        s => s._view.byteLength,

        // [4-5] FIX: ?? -999 garante retorno number mesmo quando
        //        WebKit retorna undefined sem lançar em buffer detached
        s => { try { const v = s._view[0];   return v ?? -999; } catch(_) { return -1; } },
        s => { try { const v = s._view[512]; return v ?? -999; } catch(_) { return -1; } },

        // [6] comparação de referência
        s => s._view.buffer === s._original,

        // [7-9] clone
        s => s._clone?.buf?.byteLength  ?? -1,
        s => s._clone?.tag              ?? 'null',
        s => { try { return new Uint8Array(s._clone?.buf)[0]; } catch(_) { return -1; } },

        // [10] SAB — sempre string agora
        s => s._sabResult,
    ],

    cleanup: async function() {
        this._original  = null;
        this._clone     = null;
        this._view      = null;
        this._sabResult = 'pending';
    }
};
