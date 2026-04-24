import { GCOracle } from '../mod_executor.js';
import { Groomer } from '../mod_groomer.js';

export default {
    id:       'DOM_EVENT_REMOVED_ELEMENT',
    category: 'DOM',
    risk:     'MEDIUM',
    description:
        'Múltiplos tipos de eventos disparados em elemento removido do DOM. ' +
        'MutationObserver registrado pré-remove pode disparar sobre nó freed.',

    setup: function() {
        this.callbackLog = [];
        this.el = document.createElement('div');
        this.el.tabIndex = 0;
        this.el.style.cssText = 'width:100px;height:100px;background:#222;position:absolute;will-change:transform;';

        this.el.addEventListener('focus', () => {
            try { this.callbackLog.push({ ev: 'focus', rect: this.el.getBoundingClientRect() }); }
            catch(e) { this.callbackLog.push({ ev: 'focus', err: e.message }); }
        });

        this.el.addEventListener('fuzz', () => {
            try { this.callbackLog.push({ ev: 'fuzz', offset: this.el.offsetWidth }); } 
            catch(e) { this.callbackLog.push({ ev: 'fuzz', err: e.message }); }
        });

        document.body.appendChild(this.el);

        this.mutations = [];
        this.observer = new MutationObserver(records => {
            records.forEach(r => {
                try { this.mutations.push({ type: r.type, target: r.target?.nodeName }); } 
                catch(e) { this.mutations.push({ err: e.message }); }
            });
        });
        this.observer.observe(document.body, { childList: true, subtree: true });

        // 🚨 Oráculo: Alvo marcado para abate
        if (GCOracle.registry) GCOracle.registry.register(this.el, `${this.id}_target`);
    },

    trigger: function() {
        this.el.remove();

        // 🚨 Grooming: Prepara o terreno com buracos para causar corrupção no EventTarget
        let nodes = Groomer.sprayDOM('span', 400);
        Groomer.punchHoles(nodes, 2);
    },

    probe: [
        s => { s.el.dispatchEvent(new Event('fuzz')); return s.callbackLog.length; },
        s => { s.el.dispatchEvent(new FocusEvent('focus')); return s.callbackLog.length; },
        s => s.el.getBoundingClientRect().width,
        s => s.el.offsetWidth,
        s => s.el.offsetParent,
        s => s.el.isConnected,
        s => getComputedStyle(s.el).transform,
        s => getComputedStyle(s.el).willChange,
        s => { try { s.el.focus(); return 'ok'; } catch(e) { return e.message; } },
        s => s.mutations.length,
        s => s.mutations.some(m => m.err) ? 'MUTATION_ERROR' : 'ok',
    ],

    cleanup: function() {
        try { this.observer.disconnect(); } catch(e) {}
    }
};
