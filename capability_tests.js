// capability_tests.js

export async function runCapabilityTests(log) {
    log("=== Capability Tests ===");

    // SharedArrayBuffer real
    try {
        let sab = new SharedArrayBuffer(1024);
        let view = new Int32Array(sab);
        Atomics.add(view, 0, 1);
        log("[SAB] functional");
    } catch (e) {
        log("[SAB] restricted: " + e.message);
    }

    // IndexedDB real
    try {
        let success = false;
        let req = indexedDB.open("cap_test_db");
        req.onsuccess = () => {
            success = true;
            log("[IndexedDB] working");
        };
        req.onerror = () => log("[IndexedDB] error");
        await new Promise(r => setTimeout(r, 500));
        if (!success) log("[IndexedDB] no response");
    } catch (e) {
        log("[IndexedDB] exception: " + e.message);
    }

    // WebAssembly real
    try {
        let wasmCode = new Uint8Array([
            0,97,115,109,1,0,0,0
        ]);
        await WebAssembly.instantiate(wasmCode);
        log("[WebAssembly] working");
    } catch (e) {
        log("[WebAssembly] broken: " + e.message);
    }

    // WebGL real usage
    try {
        let canvas = document.createElement("canvas");
        let gl = canvas.getContext("webgl");
        if (!gl) throw "no context";

        let buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, 1024, gl.STATIC_DRAW);

        log("[WebGL] functional");
    } catch (e) {
        log("[WebGL] failed: " + e);
    }

    // postMessage structured clone
    try {
        let ch = new MessageChannel();
        ch.port1.onmessage = () => log("[postMessage] structured clone OK");
        ch.port2.postMessage({a:1});
    } catch (e) {
        log("[postMessage] failed: " + e.message);
    }
}
