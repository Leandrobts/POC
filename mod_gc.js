export const GC = {
    light: async function() {
    let buf = [];
    for (let i = 0; i < 20; i++) buf.push(new ArrayBuffer(64 * 1024));
    buf = null;
    await new Promise(r => setTimeout(r, 4)); // yield obrigatório
},
medium: async function() {
    let trash = [];
    for (let i = 0; i < 20; i++) trash.push(new ArrayBuffer(1024 * 1024));
    trash = null;
    await new Promise(r => setTimeout(r, 12)); // yield obrigatório
},
    heavy: async function() {
        // 🚨 FIX: Reduzido de 3 para 2 rounds para evitar Out-Of-Memory no PS4 WebKit limit
        for (let round = 0; round < 2; round++) {
            let buf = [];
            try {
                for (let i = 0; i < 80; i++) {
                    buf.push(new ArrayBuffer(100 * 1024)); 
                }
            } catch(e) { /* Proteção contra OOM sincrono */ }
            buf = null;
            await new Promise(r => setTimeout(r, 0));
        }
    }
};
