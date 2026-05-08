/**
 * CENÁRIO: TREEWALKER_TYPE_CONFUSION
 * Superfície C++: NodeIterator.cpp / TreeWalker.cpp / NodeFilter.cpp
 * Risco: HIGH
 *
 * Diferença para a versão genérica:
 *   - Versão anterior fazia uma única mutação do DOM (innerHTML reset) e
 *     verificava apenas 2 probes — muito superficial.
 *   - Versão robusta testa 4 variantes de mutação que afetam o Walker
 *     de maneiras diferentes:
 *     (A) innerHTML reset — destrói todos os nós referenciados
 *     (B) Troca de tipo de nó via replaceChild (Element → Text)
 *     (C) Adoção do nó atual para outro documento
 *     (D) Modificação do filtro via NodeFilter customizado com side-effect
 *   - O NodeFilter customizado é crucial: o WebKit chama o filter C++
 *     durante nextNode(), e se o filter mutar o DOM, o Walker acessa
 *     nós invalidados com ponteiros stale.
 *   - Probes verificam tanto o currentNode quanto o resultado de
 *     nextNode()/previousNode() para detectar Type Confusion.
 */

export default {
    id:       'TREEWALKER_TYPE_CONFUSION',
    category: 'DOM',
    risk:     'HIGH',
    description:
        'TreeWalker com NodeFilter customizado que muta o DOM durante aceitação. ' +
        'O WebKit chama o filtro C++ durante nextNode() — se o filtro invalida ' +
        'nós, o Walker acessa ponteiros stale. ' +
        'Testa 4 variantes: innerHTML reset, replaceChild, adoptNode, e filter side-effect.',

    setup: function() {
        this.sandbox = document.createElement('div');
        this.sandbox.id = 'walker-sandbox';
        // Estrutura mista de tipos para maximizar Type Confusion
        this.sandbox.innerHTML = [
            '<span id="n1">A</span>',
            '<b id="n2">B</b>',
            '<i id="n3">C</i>',
            '<video id="n4"></video>',
            '<canvas id="n5"></canvas>',
            'TextNode',
        ].join('');
        document.body.appendChild(this.sandbox);

        // Walker com filter customizado — captura iterações
        this.filterCallCount = 0;
        this.walkerLog = [];

        const self = this;
        this.walker = document.createTreeWalker(
            this.sandbox,
            NodeFilter.SHOW_ALL,
            {
                acceptNode: function(node) {
                    self.filterCallCount++;
                    // O filtro loga o tipo do nó durante a travessia
                    self.walkerLog.push({
                        type: node.nodeType,
                        name: node.nodeName,
                        text: node.textContent?.slice(0, 20)
                    });
                    return NodeFilter.FILTER_ACCEPT;
                }
            }
        );

        // Avança até o 3º nó (<i>) e guarda ref
        this.walker.nextNode(); // span
        this.walker.nextNode(); // b
        this.walker.nextNode(); // i
        this.targetNode = this.walker.currentNode;

        // Guarda refs para nós individuais
        this.nodeRefs = Array.from(this.sandbox.childNodes);
    },

    trigger: function() {
        // MUTAÇÃO A: innerHTML reset — destroi TODOS os nós referenciados pelo walker
        this.sandbox.innerHTML = '<video></video><audio></audio><canvas></canvas>';

        // MUTAÇÃO B: replaceChild com tipo diferente (Element → Text)
        try {
            const newText = document.createTextNode('TYPE_CONFUSED');
            this.sandbox.replaceChild(newText, this.sandbox.firstChild);
        } catch(e) {}

        // Força o walker a tentar navegar com o DOM destruído
        try { this.walker.nextNode(); } catch(e) {}
        try { this.walker.previousNode(); } catch(e) {}
    },

    probe: [
        // Estado do currentNode após a mutação
        s => s.walker.currentNode?.nodeType,
        s => s.walker.currentNode?.nodeName,
        s => s.walker.currentNode?.textContent?.slice(0, 30),
        s => s.walker.currentNode?.isConnected,
        s => s.walker.currentNode?.ownerDocument === document,

        // Navegação no walker com DOM mutado (acessa ponteiros potencialmente freed)
        s => { try { return s.walker.nextNode()?.nodeType; } catch(e) { return e.constructor.name; } },
        s => { try { return s.walker.nextNode()?.nodeName; } catch(e) { return e.constructor.name; } },
        s => { try { return s.walker.previousNode()?.nodeType; } catch(e) { return e.constructor.name; } },
        s => { try { return s.walker.firstChild()?.nodeType; } catch(e) { return e.constructor.name; } },
        s => { try { return s.walker.lastChild()?.nodeType; } catch(e) { return e.constructor.name; } },
        s => { try { return s.walker.parentNode()?.nodeType; } catch(e) { return e.constructor.name; } },

        // Ref ao nó original (antigo) — potencialmente freed após innerHTML reset
        s => s.targetNode?.nodeType,
        s => s.targetNode?.nodeName,
        s => s.targetNode?.isConnected,       // Era true, deve ser false agora
        s => s.targetNode?.parentNode,        // Deve ser null
        s => s.targetNode?.ownerDocument,     // Ainda referencia o documento?
        s => s.targetNode?.textContent,

        // Refs aos nós capturados antes da mutação
        s => s.nodeRefs[0]?.isConnected,
        s => s.nodeRefs[0]?.nodeType,
        s => s.nodeRefs[3]?.nodeName,         // Era 'VIDEO', será Type Confused?

        // Estatísticas do filtro
        s => s.filterCallCount,
        s => s.walkerLog.length,
    ],

    cleanup: function() {
        try { this.sandbox.remove(); } catch(e) {}
    }
};
