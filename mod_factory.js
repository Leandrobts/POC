/**
 * MOD_FACTORY.JS — Agregador de Cenários UAF
 *
 * Este arquivo não contém lógica de cenário. Apenas importa cada
 * arquivo de cenário individual e os registra na lista.
 *
 * Para adicionar um novo cenário: crie o arquivo em ./scenarios/
 * e adicione o import + register aqui.
 */

import ScVideoFullscreenRemove  from './scenarios/sc_video_fullscreen_remove.js';
import ScAudioCtxClose          from './scenarios/sc_audio_ctx_close.js';
import ScWeakmapEphemeron       from './scenarios/sc_weakmap_ephemeron.js';

/* ── Media ─────────────────────────────────────────────────────────────

import ScMediaSourceUAF         from './scenarios/sc_mediasource_uaf.js';

// ── WebAudio ──────────────────────────────────────────────────────────


// ── Rendering ─────────────────────────────────────────────────────────
import ScSvgFilterUAF           from './scenarios/sc_svg_filter_uaf.js';
import ScCssAnimRemoved         from './scenarios/sc_css_anim_removed.js';
import ScCssCustomProp          from './scenarios/sc_css_custom_prop.js';

// ── DOM ───────────────────────────────────────────────────────────────
import ScIframeFrameUAF         from './scenarios/sc_iframe_frame_uaf.js';
import ScDomEventRemoved        from './scenarios/sc_dom_event_removed.js';
import ScTreewalkerConfusion    from './scenarios/sc_treewalker_confusion.js';

// ── IPC ───────────────────────────────────────────────────────────────
import ScMessagePortUAF         from './scenarios/sc_messageport_uaf.js';

// ── CoreJS ────────────────────────────────────────────────────────────
import ScNativeCallbackUAF      from './scenarios/sc_native_callback_uaf.js';


// ── Concurrency ───────────────────────────────────────────────────────
import ScStructuredClone        from './scenarios/sc_structured_clone.js';
import ScPromiseMicrotask       from './scenarios/sc_promise_microtask.js';

// ── Boundary ──────────────────────────────────────────────────────────
import ScArrayIntOverflow       from './scenarios/sc_array_int_overflow.js';
import ScStringIntOverflow      from './scenarios/sc_string_int_overflow.js';
import ScRegexpOverflow         from './scenarios/sc_regexp_overflow.js';*/

export const Factory = {

    buildScenarios: function() {
        const list = [];

        const register = (scenario) => {
            try {
                if (typeof scenario.supported === 'function'
                    && scenario.supported() === false) return;
                list.push(scenario);
            } catch(e) {
                console.warn('[Factory] Falha ao registrar cenário:', e);
            }
        };

        // Ordem de prioridade: HIGH primeiro, depois MEDIUM, depois Boundary
        register(ScVideoFullscreenRemove);
        register(ScAudioCtxClose);
        register(ScWeakmapEphemeron);
        
        /*register(ScMediaSourceUAF);
        register(ScIframeFrameUAF);
        register(ScNativeCallbackUAF);
        register(ScTreewalkerConfusion);
        register(ScStructuredClone);
        register(ScPromiseMicrotask);
    
        register(ScCssCustomProp);

        register(ScSvgFilterUAF);
        register(ScCssAnimRemoved);
        register(ScDomEventRemoved);
        register(ScMessagePortUAF);

        register(ScArrayIntOverflow);
        register(ScStringIntOverflow);
        register(ScRegexpOverflow);*/

        return list;
    }
};
