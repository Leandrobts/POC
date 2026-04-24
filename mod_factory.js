/**
 * MOD_FACTORY.JS — Gerenciador de Cenários Modular
 * Importa os testes individuais da pasta /scenarios e ignora o AudioContext.
 */

import scArrayOverflow from './scenarios/sc_array_int_overflow.js';
import scCssAnim from './scenarios/sc_css_anim_removed.js';
import scCssCustom from './scenarios/sc_css_custom_prop.js';
import scDomEvent from './scenarios/sc_dom_event_removed.js';
import scIframeUaf from './scenarios/sc_iframe_frame_uaf.js';
import scMediaSource from './scenarios/sc_mediasource_uaf.js';
import scMessagePort from './scenarios/sc_messageport_uaf.js';
import scNativeCallback from './scenarios/sc_native_callback_uaf.js';
import scPromiseMicro from './scenarios/sc_promise_microtask.js';
import scRegexpOverflow from './scenarios/sc_regexp_overflow.js';
import scStringOverflow from './scenarios/sc_string_int_overflow.js';
import scStructuredClone from './scenarios/sc_structured_clone.js';
import scSvgFilter from './scenarios/sc_svg_filter_uaf.js';
import scTreewalker from './scenarios/sc_treewalker_confusion.js';
import scVideoFullscreen from './scenarios/sc_video_fullscreen_remove.js';
import scWeakmapEphemeron from './scenarios/sc_weakmap_ephemeron.js';

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
