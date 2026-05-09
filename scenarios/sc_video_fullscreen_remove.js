/**
 * SC_VIDEO_FULLSCREEN_REMOVE.JS  [v2 — falsos positivos corrigidos]
 *
 * FIX probe[4] — TYPE_CONFUSION string→number:
 *   s._video.error?.code ?? 'null' retornava 'null' (string) no baseline,
 *   porque o video não tinha erro ainda.
 *   Após o trigger, _video.error.code = 4 (MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED).
 *   O executor via string→number = TYPE_CONFUSION falso.
 *   Correção: String() em probe[4] para manter tipo string em ambos os estados.
 */

export default {
    id:          'VIDEO_FULLSCREEN_REMOVE',
    category:    'MEDIA/DOM',
    risk:        'HIGH',
    description: 'HTMLVideoElement removido durante pedido de fullscreen/PiP. '
                + 'Testa ponteiro stale no FullscreenManager C++ do WebCore.',

    _video:        null,
    _container:    null,
    _pipWindow:    null,
    _errType:      'none',   // FIX: era null
    _readyState0:  -1,

    supported: function() {
        return typeof HTMLVideoElement !== 'undefined';
    },

    setup: async function() {
        this._errType   = 'none';   // FIX
        this._pipWindow = null;

        this._container = document.createElement('div');
        document.body.appendChild(this._container);

        this._video = document.createElement('video');
        this._video.style.cssText = 'width:160px;height:90px;position:absolute;left:-9999px';
        this._video.muted    = true;
        this._video.autoplay = false;
        this._video.loop     = false;

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

    trigger: async function() {
        const fsPromise = this._video.requestFullscreen?.()?.catch(e => {
            this._errType = e.constructor.name;
        });

        this._video.remove();
        void document.body.offsetWidth;

        await fsPromise?.catch(() => {});

        if (typeof this._video.requestPictureInPicture === 'function') {
            try {
                this._pipWindow = await this._video.requestPictureInPicture();
            } catch(e) {
                this._errType = (this._errType !== 'none' ? this._errType + '|' : '')
                              + 'PiP:' + e.constructor.name;
            }
        }

        try { await document.exitFullscreen?.(); }        catch(_) {}
        try { await document.exitPictureInPicture?.(); }  catch(_) {}

        await new Promise(r => setTimeout(r, 30));
    },

    probe: [
        // [0-5] estado do video após remoção
        s => String(s._video.isConnected),
        s => s._video.readyState,
        s => String(s._video.paused),
        s => String(s._video.ended),

        // [4] FIX: String() — era ?? 'null' que causava string→number
        s => String(s._video.error?.code ?? 'null'),

        s => s._video.networkState,

        // [6-9] fullscreen state
        s => String(document.fullscreenElement === s._video),
        s => document.fullscreenElement?.nodeName ?? 'null',
        s => String(document.pictureInPictureElement === s._video),
        s => typeof document.fullscreenElement,

        // [10-12] PiP e erro
        s => String(s._pipWindow?.width  ?? 'null'),
        s => String(s._pipWindow?.height ?? 'null'),
        s => s._errType,   // sempre string

        // [13-14] readyState baseline e container
        s => s._readyState0,
        s => String(s._container.isConnected),
    ],

    cleanup: async function() {
        try { await document.exitFullscreen?.();       } catch(_) {}
        try { await document.exitPictureInPicture?.(); } catch(_) {}
        try { this._pipWindow?.close?.();              } catch(_) {}
        this._container?.remove();
        this._container   = null;
        this._video       = null;
        this._pipWindow   = null;
        this._errType     = 'none';
        this._readyState0 = -1;
    }
};
