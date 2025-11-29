export function log(msg, type = "info") {
    const d = document.getElementById("log");
    const color = type === "success" ? "#2ea043" : type === "fail" ? "#ff7b72" : "#58a6ff";
    d.innerHTML += `<div style="color:${color}">[${new Date().toLocaleTimeString()}] ${msg}</div>`;
    d.scrollTop = d.scrollHeight;
}

export function hexToBytes(hex) {
    const len = hex.length / 2;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes;
}
