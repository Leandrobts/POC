function log(msg, type = "info") {
    const d = document.getElementById("log");
    if (!d) return;

    let color = "#aaaaaa";
    if (type === "success") color = "#55ff55";
    if (type === "fail") color = "#ff5555";
    if (type === "warn") color = "#ffff55";
    if (type === "leak") color = "#d455ff";

    const entry = document.createElement("div");
    entry.style.color = color;
    entry.style.borderBottom = "1px solid #222";
    entry.style.padding = "2px";
    
    const time = new Date().toLocaleTimeString();
    entry.innerHTML = `[${time}] ${msg}`;
    
    d.appendChild(entry);
    d.scrollTop = d.scrollHeight;
}

function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes;
}
