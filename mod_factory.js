/**
 * MOD_FACTORY.JS — Gerenciador de Cenários Modular
 * Importa os testes individuais da pasta e ignora o AudioContext.
 */

import scArrayOverflow from './sc_array_int_overflow.js';
import scCssAnim from './sc_css_anim_removed.js';
import scCssCustom from './sc_css_custom_prop.js';
import scDomEvent from './sc_dom_event_removed.js';
import scIframeUaf from './sc_iframe_frame_uaf.js';
import scMediaSource from './sc_mediasource_uaf.js';
import scMessagePort from './sc_messageport_uaf.js';
import scNativeCallback from './sc_native_callback_uaf.js';
import scPromiseMicro from './sc_promise_microtask.js';
import scRegexpOverflow from './sc_regexp_overflow.js';
import scStringOverflow from './sc_string_int_overflow.js';
import scStructuredClone from './sc_structured_clone.js';
import scSvgFilter from './sc_svg_filter_uaf.js';
import scTreewalker from './sc_treewalker_confusion.js';
import scVideoFullscreen from './sc_video_fullscreen_remove.js';
import scWeakmapEphemeron from './sc_weakmap_ephemeron.js';

export const Factory = {
    buildScenarios: function() {
        const allScenarios = [
            scArrayOverflow,
            scCssAnim,
            scCssCustom,
            scDomEvent,
            scIframeUaf,
            scMediaSource,
            scMessagePort,
            scNativeCallback,
            scPromiseMicro,
            scRegexpOverflow,
            scStringOverflow,
            scStructuredClone,
            scSvgFilter,
            scTreewalker,
            scVideoFullscreen,
            scWeakmapEphemeron
        ];

        const activeList = [];

        allScenarios.forEach(s => {
            try {
                if (s.supported && s.supported() === false) return;
                activeList.push(s);
            } catch(e) {
                console.error(`Erro ao registrar cenário:`, e);
            }
        });

        return activeList;
    }
};
