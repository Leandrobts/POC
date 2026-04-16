/**
 * MÓDULO 1: INSTANCE FACTORY (BROAD COVERAGE)
 * Foco: Cobrir a maior superfície de ataque do WebKit (DOM, Áudio, IPC, JSC).
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
        // 1. JavaScriptCore (Memória e Coleções)
        // ==========================================
        safeBuild("JSC", "DataView", () => new DataView(new ArrayBuffer(64)));
        safeBuild("JSC", "Float64Array", () => new Float64Array(16));
        safeBuild("JSC", "Uint8ClampedArray", () => new Uint8ClampedArray(64));
        safeBuild("JSC", "WeakMap", () => new WeakMap());
        safeBuild("JSC", "Set", () => new Set());

        // ==========================================
        // 2. Web Audio API (Histórico GIGANTESCO de UAFs)
        // ==========================================
        safeBuild("AUDIO", "AudioContext", () => new (window.AudioContext || window.webkitAudioContext)());
        safeBuild("AUDIO", "OfflineAudio", () => new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(2, 44100, 44100));
        safeBuild("AUDIO", "Oscillator", () => {
            let ctx = new (window.AudioContext || window.webkitAudioContext)();
            return ctx.createOscillator();
        });
        safeBuild("AUDIO", "BiquadFilter", () => {
            let ctx = new (window.AudioContext || window.webkitAudioContext)();
            return ctx.createBiquadFilter();
        });

        // ==========================================
        // 3. IPC / Message Passing (Falhas de Sincronização)
        // ==========================================
        safeBuild("IPC", "MessageChannel", () => new MessageChannel());
        safeBuild("IPC", "BroadcastChannel", () => new BroadcastChannel("fuzz_chan"));

        // ==========================================
        // 4. DOM Elements & Rendering
        // ==========================================
        safeBuild("DOM", "HTMLCanvas", () => document.createElement('canvas'));
        safeBuild("DOM", "Canvas2D", () => document.createElement('canvas').getContext('2d'));
        safeBuild("DOM", "SVGElement", () => document.createElementNS("http://www.w3.org/2000/svg", "svg"));
        safeBuild("DOM", "FileReader", () => new FileReader());

        // ==========================================
        // 5. WebRTC / Networking (Se ativado no FW)
        // ==========================================
        safeBuild("NET", "RTCPeerConnection", () => new RTCPeerConnection());
        safeBuild("NET", "WebSocket", () => new WebSocket("ws://127.0.0.1:9999"));

        return instances;
    }
};