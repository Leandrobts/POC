// context_tests.js

export function runContextTests(log) {
    log("=== Context Tests ===");

    // Worker test
    try {
        let worker = new Worker(URL.createObjectURL(new Blob([`
            postMessage({
                wasm: typeof WebAssembly,
                fetch: typeof fetch,
                sab: typeof SharedArrayBuffer
            });
        `], {type: "application/javascript"})));

        worker.onmessage = (e) => {
            log("[Worker] " + JSON.stringify(e.data));
        };
    } catch (e) {
        log("[Worker] failed: " + e.message);
    }

    // iframe test
    try {
        let iframe = document.createElement("iframe");
        document.body.appendChild(iframe);

        let result = {
            fetch: typeof iframe.contentWindow.fetch,
            wasm: typeof iframe.contentWindow.WebAssembly
        };

        log("[iframe] " + JSON.stringify(result));
    } catch (e) {
        log("[iframe] failed: " + e.message);
    }

    // timing resolution
    try {
        let t1 = performance.now();
        let t2 = performance.now();
        log("[Timing] resolution ~" + (t2 - t1));
    } catch (e) {
        log("[Timing] failed");
    }

    // event loop ordering
    try {
        let order = [];

        Promise.resolve().then(() => order.push("microtask"));
        setTimeout(() => {
            order.push("macrotask");
            log("[EventLoop] " + order.join(" -> "));
        }, 0);
    } catch (e) {
        log("[EventLoop] failed");
    }
}
