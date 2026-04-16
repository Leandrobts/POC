/**
 * MÓDULO 1: INSTANCE FACTORY
 * Objetivo: Construir objetos complexos e "frescos" para cada ciclo de fuzzing.
 * Foco: JS Heap (TypedArrays, Buffers) e WebCore Bridges (DOM, Audio, IPC).
 */

export const Factory = {
    
    // Função principal que será chamada pelo Executor
    buildTargets: function() {
        const instances = [];

        // Wrapper de segurança: Se uma API não existir no PS4, não quebra o fuzzer
        const safeBuild = (category, name, builderFunc) => {
            try {
                let obj = builderFunc();
                if (obj) {
                    instances.push({ category, name, instance: obj });
                }
            } catch(e) {
                // Silencioso. A API não é suportada neste firmware.
            }
        };

        /* ==========================================
           1. JSC MEMORY & HEAP TARGETS (ALTA PRIORIDADE)
           Foco em corromper o JSC Butterfly e manipulação de Buffers
           ========================================== */
        safeBuild("JSC", "ArrayBuffer", () => new ArrayBuffer(1024));
        safeBuild("JSC", "Uint8Array", () => new Uint8Array(new ArrayBuffer(256)));
        safeBuild("JSC", "Float64Array", () => new Float64Array([1.1, 2.2, 3.3, 4.4]));
        safeBuild("JSC", "DataView", () => new DataView(new ArrayBuffer(64)));
        
        // Estruturas complexas do ECMAScript
        safeBuild("ECMA", "Map", () => new Map([['A', 1], ['B', 2]]));
        safeBuild("ECMA", "Set", () => new Set([1, 2, 3, Object.create(null)]));
        safeBuild("ECMA", "WeakMap", () => new WeakMap());
        safeBuild("ECMA", "RegExp", () => new RegExp('(a+)+b', 'g'));
        safeBuild("ECMA", "Promise", () => Promise.resolve(1337));

        /* ==========================================
           2. WEBCORE & C++ BINDINGS
           Foco em Type Confusion ao passar objetos JS para o motor de renderização
           ========================================== */
        // DOM e Renderização
        safeBuild("DOM", "HTMLCanvas", () => document.createElement('canvas'));
        safeBuild("DOM", "Canvas2DContext", () => document.createElement('canvas').getContext('2d'));
        safeBuild("DOM", "DOMParser", () => new DOMParser());
        safeBuild("DOM", "XMLSerializer", () => new XMLSerializer());

        // Comunicação e IPC (Excelente para Race Conditions e UAF)
        safeBuild("IPC", "MessageChannel", () => new MessageChannel());
        safeBuild("IPC", "Blob", () => new Blob(['fuzz_data'], {type: 'text/plain'}));
        safeBuild("IPC", "FormData", () => {
            let fd = new FormData();
            fd.append('test', 'data');
            return fd;
        });

        // APIs de Mídia (Historicamente vulneráveis no WebKit)
        safeBuild("MEDIA", "AudioContext", () => new (window.AudioContext || window.webkitAudioContext)());
        safeBuild("MEDIA", "OfflineAudioContext", () => new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 44100, 44100));

        return instances;
    }
};
