/**
 * MÓDULO 1: INSTANCE FACTORY (MINIMIZADO)
 * Foco exclusivo: Interação entre Pixel Buffers (Canvas) e DataView.
 */

export const Factory = {
    buildTargets: function() {
        const instances = [];

        const safeBuild = (category, name, builderFunc) => {
            try {
                let obj = builderFunc();
                if (obj) instances.push({ category, name, instance: obj });
            } catch(e) {}
        };

        // ==========================================
        // ALVOS ISOLADOS PARA O TESTE
        // ==========================================
        
        // 1. O Alvo do Vazamento
        safeBuild("JSC", "DataView", () => new DataView(new ArrayBuffer(64)));
        
        // 2. Os Criadores de "Buracos" (Heap Grooming acidental do Fuzzer)
        safeBuild("DOM", "HTMLCanvas", () => document.createElement('canvas'));
        safeBuild("DOM", "Canvas2DContext", () => document.createElement('canvas').getContext('2d', { willReadFrequently: true }));

        // Tudo abaixo está desativado para limpar o ruído!
        /*
        safeBuild("JSC", "Uint8Array", () => new Uint8Array(256));
        safeBuild("ECMA", "Map", () => new Map());
        safeBuild("IPC", "MessageChannel", () => new MessageChannel());
        safeBuild("MEDIA", "AudioContext", () => new window.AudioContext());
        */

        return instances;
    }
};