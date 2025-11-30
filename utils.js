export function log(msg, type = "info") {
    const d = document.getElementById("log");
    if(!d) return;
    let color = "#ccc";
    if(type === "success") color = "#2ea043";
    if(type === "fail") color = "#ff7b72";
    if(type === "warn") color = "#d29922";
    d.innerHTML += `<div style="color:${color}">[${new Date().toLocaleTimeString()}] ${msg}</div>`;
    d.scrollTop = d.scrollHeight;
}

export function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes;
}
