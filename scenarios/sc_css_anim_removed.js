/**
 * CENÁRIO: CSS_ANIMATION_REMOVED_ELEMENT
 * Superfície C++: CSSAnimationController.cpp / RenderStyle.cpp / CompositorAnimations.cpp
 * Risco: MEDIUM
 *
 * Diferença para a versão genérica:
 *   - Versão anterior tinha apenas 1 animação e aguardava passivamente.
 *   - Versão robusta usa múltiplas animações simultâneas em propriedades
 *     diferentes (transform, opacity, filter, clip-path) para pressionar
 *     mais caminhos do CSSAnimationController.
 *   - Adiciona Web Animations API (element.animate()) que tem ciclo de
 *     vida separado do CSS — o AnimationTimeline pode segurar ptr freed.
 *   - Remove o elemento durante um requestAnimationFrame ativo (não apenas
 *     programaticamente) para coincidir com o frame tick do compositor.
 *   - Probes verificam getAnimations() e Animation.playState pós-free.
 */

export default {
    id:       'CSS_ANIMATION_REMOVED_ELEMENT',
    category: 'Rendering',
    risk:     'MEDIUM',
    description:
        'Múltiplas animações CSS + Web Animations API em elemento removido. ' +
        'Transform, opacity, filter e clip-path pressionam 4 caminhos do compositor. ' +
        'Remove durante requestAnimationFrame para coincidir com frame tick. ' +
        'AnimationTimeline pode manter ptr para RenderStyle freed.',

    setup: function() {
        this.style = document.createElement('style');
        this.style.textContent = `
            @keyframes fuzz-t  { 0%{transform:translateX(0)  rotate(0deg)}   100%{transform:translateX(80px) rotate(360deg)} }
            @keyframes fuzz-o  { 0%{opacity:1}                                100%{opacity:0.1} }
            @keyframes fuzz-f  { 0%{filter:blur(0px)}                         100%{filter:blur(4px) brightness(2)} }
            @keyframes fuzz-c  { 0%{clip-path:inset(0%)}                      100%{clip-path:inset(20%)} }
            .fuzz-multi {
                animation:
                    fuzz-t 0.07s linear infinite,
                    fuzz-o 0.05s ease infinite alternate,
                    fuzz-f 0.09s linear infinite,
                    fuzz-c 0.06s ease-in-out infinite alternate;
                width: 60px;
                height: 60px;
                background: linear-gradient(45deg, red, blue);
                position: absolute;
                will-change: transform, opacity;
                top: 0; left: 0;
            }
        `;
        document.head.appendChild(this.style);

        this.el = document.createElement('div');
        this.el.className = 'fuzz-multi';
        document.body.appendChild(this.el);

        // Web Animations API — AnimationTimeline separado do CSS
        this.webAnim = this.el.animate([
            { backgroundColor: 'red',  transform: 'scale(1)'   },
            { backgroundColor: 'blue', transform: 'scale(1.5)' },
        ], {
            duration:   60,
            iterations: Infinity,
            easing:     'ease-in-out',
        });

        this.animLog = [];
        this.el.addEventListener('animationiteration', () => {
            try { this.animLog.push({ rect: this.el.getBoundingClientRect() }); }
            catch(e) { this.animLog.push({ err: e.message }); }
        });
    },

    trigger: function() {
        // Remove durante um requestAnimationFrame — coincide com frame tick do compositor
        requestAnimationFrame(() => {
            this.el.remove();
            // Tenta continuar a animação Web Animations após remover o elemento
            try { this.webAnim.play(); } catch(e) {}
        });
    },

    probe: [
        // CSS Animations pós-remove
        s => s.el.getAnimations?.().length,
        s => s.el.getAnimations?.()[0]?.playState,
        s => s.el.getAnimations?.()[0]?.currentTime,
        s => s.el.getAnimations?.()[0]?.effect?.target === s.el,

        // Web Animations API pós-remove
        s => s.webAnim?.playState,
        s => s.webAnim?.currentTime,
        s => { try { s.webAnim?.cancel(); return 'ok'; } catch(e) { return e.message; } },

        // Geometry (RenderObject freed)
        s => s.el.getBoundingClientRect().x,
        s => s.el.getBoundingClientRect().width,
        s => getComputedStyle(s.el).transform,
        s => getComputedStyle(s.el).opacity,
        s => getComputedStyle(s.el).filter,
        s => getComputedStyle(s.el).animationPlayState,

        // Eventos de animação gravados
        s => s.animLog.length,
        s => s.animLog.some(l => l.err) ? 'ANIM_CALLBACK_ERROR' : 'ok',
    ],

    cleanup: function() {
        try { this.webAnim?.cancel(); } catch(e) {}
        try { this.style.remove(); } catch(e) {}
    }
};
