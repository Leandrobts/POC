export function log(msg, type = "info") {
    const d = document.getElementById("log");
    if (!d) return; // Proteção caso o DOM não esteja pronto

    let color = "#7d8590"; // Cinza padrão
    if (type === "success") color = "#2ea043"; // Verde
    if (type === "fail") color = "#f85149";    // Vermelho
    if (type === "warn") color = "#d29922";    // Amarelo
    if (type === "leak") color = "#a371f7";    // Roxo (Leak)

    const entry = document.createElement("div");
    entry.style.color = color;
    if (type === "leak" || type === "success") entry.style.fontWeight = "bold";
    
    entry.innerHTML = `[${new Date().toLocaleTimeString()}] ${msg}`;
    d.appendChild(entry);
    d.scrollTop = d.scrollHeight;
}
