export function log(msg, type = "info") {
    const d = document.getElementById("log");
    if(!d) return;
    
    let color = "#ccc";
    if(type === "success") color = "#2ea043";
    if(type === "fail") color = "#ff7b72";
    if(type === "warn") color = "#d29922";

    const div = document.createElement("div");
    div.style.color = color;
    div.innerHTML = `[${new Date().toLocaleTimeString()}] ${msg}`;
    d.appendChild(div);
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
