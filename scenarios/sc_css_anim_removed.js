import { GCOracle } from '../mod_executor.js';
import { Groomer } from '../mod_groomer.js';

export default {
    id:       'CSS_ANIMATION_REMOVED_ELEMENT',
    category: 'Rendering',
    risk:     'MEDIUM',
    description:
        'Múltiplas animações CSS + Web Animations API em elemento removido. ' +
        'Remove durante requestAnimationFrame para coincidir com frame tick. ' +
        'AnimationTimeline pode manter ptr para RenderStyle freed.',

    setup: function() {
        this.style = document.createElement('style');
        this.style.textContent = `
            @keyframes fuzz-t  { 0%{transform:translateX(0)  rotate(0deg)}   100%{transform:translateX(80px) rotate(360deg)} }
            @keyframes fuzz-o  { 0%{opacity:1}                                100%{opacity:0.1} }
            .fuzz-multi {
                animation: fuzz-t 0.07s linear infinite, fuzz-o 0.05s ease infinite alternate;
                width: 60px; height: 60px; background: red; position: absolute;
                will-change: transform, opacity;
            }
        `;
        document.head.appendChild(this.style);

        this.el = document.createElement('div');
        this.el.className = 'fuzz-multi';
        document.body.appendChild(this.el);

        this.webAnim = this.el.animate([
            { backgroundColor: 'red',  transform: 'scale(1)'   },
            { backgroundColor: 'blue', transform: 'scale(1.5)' },
        ], { duration: 60, iterations: Infinity, easing: 'ease-in-out' });

        this.animLog = [];
        this.el.addEventListener('animationiteration', () => {
            try { this.animLog.push({ rect: this.el.getBoundingClientRect() }); }
            catch(e) { this.animLog.push({ err: e.message }); }
        });

        // 🚨 Oráculo: Registra o elemento a ser destruído
        if (GCOracle.registry) GCOracle.registry.register(this.el, `${this.id}_target`);
    },

    trigger: function() {
        requestAnimationFrame(() => {
            this.el.remove();
            
            // 🚨 Grooming: Esburaca o Heap do bmalloc (DOM)
            let nodes = Groomer.sprayDOM('div', 200);
            Groomer.punchHoles(nodes, 2);

            try { this.webAnim.play(); } catch(e) {}
        });
    },

    probe: [
        s => s.el.getAnimations?.().length,
        s => s.el.getAnimations?.()[0]?.playState,
        s => s.el.getAnimations?.()[0]?.currentTime,
        s => s.webAnim?.playState,
        s => s.el.getBoundingClientRect().x,
        s => getComputedStyle(s.el).transform,
        s => getComputedStyle(s.el).animationPlayState,
        s => s.animLog.length,
        s => s.animLog.some(l => l.err) ? 'ANIM_CALLBACK_ERROR' : 'ok',
    ],

    cleanup: function() {
        try { this.webAnim?.cancel(); } catch(e) {}
        try { this.style.remove(); } catch(e) {}
    }
};
