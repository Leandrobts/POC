/**
 * MOD_FACTORY.JS — A Tática do Atirador Furtivo
 * Foco EXCLUSIVO em: Código Sony (Manx), Áudio (Multithread) e GC (Ephemerons).
 */

// ── Imports dos Alvos de Ouro ─────────────────────────────────────────
import ScVideoFullscreenRemove  from './scenarios/sc_video_fullscreen_remove.js';
import ScAudioCtxClose          from './scenarios/sc_audio_ctx_close.js';
import ScWeakmapEphemeron       from './scenarios/sc_weakmap_ephemeron.js';

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

        // Registramos APENAS os nossos 3 alvos cirúrgicos
        register(ScVideoFullscreenRemove); // Media Manx (Código proprietário da Sony)
        register(ScAudioCtxClose);         // WebAudio (Condição de Corrida)
        register(ScWeakmapEphemeron);      // JavaScriptCore (Dessincronização do GC)

        return list;
    }
};
