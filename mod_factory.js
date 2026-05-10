
/**
 * MOD_FACTORY.JS — Gerenciador de Cenários Modular
 * MODO PRODUÇÃO: Todos os 16 cenários ativos para varredura contínua.
 */

import scDomRange from './scenarios/sc_dom_range_extract_uaf.js';
import scCanvasImage from './scenarios/sc_canvas_imagedata_oob.js';
//import scMediaSource from './scenarios/sc_mediasource_uaf.js';
import scMessagePort from './scenarios/sc_messageport_uaf.js';
import scNativeCallback from './scenarios/sc_native_callback_uaf.js';
import scPromiseMicro from './scenarios/sc_promise_microtask.js';
import scRegexpOverflow from './scenarios/sc_regexp_overflow.js';
import scStringOverflow from './scenarios/sc_string_int_overflow.js';
import scStructuredClone from './scenarios/sc_structured_clone.js';
import scTreewalker from './scenarios/sc_treewalker_confusion.js';
import scSvgFilter from './scenarios/sc_svg_filter_uaf.js';
import scWeakmapEphemeron from './scenarios/sc_weakmap_ephemeron.js';
import scButterfly from './scenarios/sc_butterfly_splice.js';
import scFinalization from './scenarios/sc_finalization_race.js';
import scFullscreen from './scenarios/sc_fullscreen_api_race.js';
import scVideoNative from './scenarios/sc_video_native_fs_swap.js';
import scVideoFullscreen from './scenarios/sc_video_fullscreen_remove.js';
import scArrayOverflow     from './scenarios/sc_array_int_overflow.js';
import scCssAnim           from './scenarios/sc_css_anim_removed.js';
import scCssCustom         from './scenarios/sc_css_custom_prop.js';
import scDomEvent          from './scenarios/sc_dom_event_removed.js';
import scIframeUaf         from './scenarios/sc_iframe_frame_uaf.js';
import scWebglBuffer      from './scenarios/sc_webgl_buffer_overflow.js';
import scShadowSlot       from './scenarios/sc_shadow_dom_slot_uaf.js';
import scAudioNode        from './scenarios/sc_audio_node_uaf.js';
import scRangeBoundary    from './scenarios/sc_range_boundary_uaf.js';
import scCanvasContext    from './scenarios/sc_canvas_context_uaf.js';
import scCustomElement    from './scenarios/sc_custom_element_uaf.js';
import scProxyConfusion   from './scenarios/sc_proxy_type_confusion.js';
import scFetchAbort       from './scenarios/sc_fetch_abort_uaf.js';
import scGeneratorGC      from './scenarios/sc_generator_gc_uaf.js';
import scIntersectionObs  from './scenarios/sc_intersection_observer_uaf.js';

export const Factory = {
    buildScenarios: function() {
        const allScenarios = [ 
            scIframeUaf,
            scFullscreen,
            scVideoNative,
            scFinalization,
            scButterfly,              
            scArrayOverflow,
            scCssAnim,
            scCssCustom,
            scDomEvent, 
            scDomRange,
          //  scMediaSource,                   
            scCanvasImage,
            scMessagePort,
            scNativeCallback,
            scPromiseMicro,
            scRegexpOverflow,
            scStringOverflow,
            scStructuredClone,
            scTreewalker,
            scSvgFilter,        
            scVideoFullscreen,     
           scWebglBuffer,
            scShadowSlot,      
           scAudioNode,     
        //tela branca scRangeBoundary, 
          scCanvasContext,
            scCustomElement,
            //scProxyConfusion,
            scFetchAbort,
            scGeneratorGC,      
            scIntersectionObs,
  
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
