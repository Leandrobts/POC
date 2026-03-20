// enumeration_tests.js

export async function runEnumerationTests(log) {
    log("=== Enumeration Tests ===");

    await enumerateGlobals(log);
    await enumeratePrototypes(log);
    await enumerateConstructors(log);
    await enumerateWebAPIs(log);

    log("=== Enumeration Done ===");
}

// ─────────────────────────────────────────
// 1. GLOBAL OBJECT
// ─────────────────────────────────────────
async function enumerateGlobals(log) {
    log("[Global] enumerating window");

    try {
        let props = Object.getOwnPropertyNames(window);

        log(`[Global] total properties: ${props.length}`);

        // log parcial (evita flood)
        log("[Global] sample: " + props.slice(0, 20).join(", "));

    } catch (e) {
        log("[Global] error: " + e.message);
    }

    await yieldControl();
}

// ─────────────────────────────────────────
// 2. PROTOTYPES IMPORTANTES
// ─────────────────────────────────────────
async function enumeratePrototypes(log) {
    log("[Prototypes] start");

    const targets = [
        Array,
        Object,
        Function,
        String,
        Number,
        Boolean,
        Promise,
        RegExp,
        Date,
        Map,
        Set,
        WeakMap,
        WeakSet,
        ArrayBuffer,
        DataView,
        Uint8Array,
        Float64Array
    ];

    for (let t of targets) {
        try {
            let name = t.name;
            let proto = t.prototype;

            let props = Object.getOwnPropertyNames(proto);

            log(`[Proto] ${name}: ${props.length} props`);

        } catch (e) {
            log("[Proto] error: " + e.message);
        }

        await yieldControl();
    }
}

// ─────────────────────────────────────────
// 3. CONSTRUCTORS DETECTADOS
// ─────────────────────────────────────────
async function enumerateConstructors(log) {
    log("[Constructors] scanning");

    try {
        let found = [];

        for (let key of Object.getOwnPropertyNames(window)) {
            try {
                let val = window[key];

                if (typeof val === "function" && val.prototype) {
                    found.push(key);
                }

            } catch (e) {}
        }

        log(`[Constructors] total: ${found.length}`);
        log("[Constructors] sample: " + found.slice(0, 20).join(", "));

    } catch (e) {
        log("[Constructors] error: " + e.message);
    }

    await yieldControl();
}

// ─────────────────────────────────────────
// 4. WEB APIs CRÍTICAS
// ─────────────────────────────────────────
async function enumerateWebAPIs(log) {
    log("[WebAPI] scanning");

    const apis = [
        "WebGLRenderingContext",
        "WebGL2RenderingContext",
        "Worker",
        "SharedArrayBuffer",
        "Atomics",
        "WebAssembly",
        "IndexedDB",
        "MediaSource",
        "RTCPeerConnection",
        "OffscreenCanvas"
    ];

    for (let api of apis) {
        try {
            let exists = typeof window[api] !== "undefined";

            if (!exists) {
                log(`[WebAPI] ${api}: ❌ absent`);
                continue;
            }

            let proto = window[api].prototype;
            let props = proto ? Object.getOwnPropertyNames(proto) : [];

            log(`[WebAPI] ${api}: ${props.length} methods`);

        } catch (e) {
            log(`[WebAPI] ${api}: error`);
        }

        await yieldControl();
    }
}

// ─────────────────────────────────────────
// UTIL
// ─────────────────────────────────────────
function yieldControl() {
    return new Promise(r => setTimeout(r, 0));
}
