// limits_tests.js

export function runLimitsTests(log) {
    log("=== Limits Tests ===");

    // Max ArrayBuffer
    try {
        let size = 1 << 20; // 1MB
        while (true) {
            new ArrayBuffer(size);
            size *= 2;
            if (size > (1 << 30)) break; // 1GB safety
        }
        log("[ArrayBuffer] reached ~" + size);
    } catch (e) {
        log("[ArrayBuffer] limit hit");
    }

    // Max string size
    try {
        let s = "A";
        while (s.length < 1e8) {
            s += s;
        }
        log("[String] large string OK");
    } catch (e) {
        log("[String] limit hit");
    }

    // Recursion depth
    try {
        let depth = 0;
        (function f() {
            depth++;
            f();
        })();
    } catch (e) {
        log("[Recursion] depth ~" + e.stack?.length || "unknown");
    }

    // DOM nodes
    try {
        let count = 0;
        let container = document.createElement("div");
        document.body.appendChild(container);

        while (count < 50000) {
            let el = document.createElement("span");
            container.appendChild(el);
            count++;
        }

        log("[DOM] created " + count + " nodes");
    } catch (e) {
        log("[DOM] limit hit");
    }

    // Canvas size
    try {
        let canvas = document.createElement("canvas");
        canvas.width = 16384;
        canvas.height = 16384;
        let ctx = canvas.getContext("2d");
        ctx.fillRect(0,0,1,1);
        log("[Canvas] large size OK");
    } catch (e) {
        log("[Canvas] limit hit");
    }
}
