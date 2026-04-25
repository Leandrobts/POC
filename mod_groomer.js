/**
 * MOD_GROOMER.JS — Heap Manipulator (Versao 13.0 - High Performance)
 * Otimizado: Uso de DocumentFragment e Batch Layout para poupar CPU do PS4.
 */

export const Groomer = {
    trashStrings: [],
    trashDOM: [],

    sprayStrings: function(count, size = 1024) {
        let trash = new Array(count);
        const baseStr = 'A'.repeat(size);
        for (let i = 0; i < count; i++) {
            trash[i] = (baseStr + i.toString()).slice(0, size);
        }
        this.trashStrings.push(trash);
        return trash;
    },

    sprayDOM: function(tag, count) {
        let trash = new Array(count);
        
        let sandbox = document.getElementById('groomer-sandbox');
        if (!sandbox) {
            sandbox = document.createElement('div');
            sandbox.id = 'groomer-sandbox';
            sandbox.style.position = 'absolute';
            sandbox.style.top = '-9999px';
            sandbox.style.visibility = 'hidden';
            document.body.appendChild(sandbox);
        }
        
        // 🚨 FIX DE PERFORMANCE: Usamos um fragmento para evitar milhares de reflows
        let fragment = document.createDocumentFragment();
        
        for (let i = 0; i < count; i++) {
            let el = document.createElement(tag);
            el.id = `groom_${tag}_${i}`;
            fragment.appendChild(el);
            trash[i] = el;
        }
        
        // Injetamos todos os elementos de uma vez só
        sandbox.appendChild(fragment);
        
        // 🚨 FIX DE PERFORMANCE: Forçamos a alocação pesada no WebCore APENAS UMA VEZ
        void sandbox.offsetWidth;
        
        this.trashDOM.push(trash);
        return trash;
    },

    punchHoles: function(array, step = 2) {
        for (let i = 0; i < array.length; i += step) {
            array[i] = null;
        }
    },

    cleanup: function() {
        this.trashStrings = [];
        this.trashDOM = [];
        
        let sandbox = document.getElementById('groomer-sandbox');
        if (sandbox) {
            // Em vez de innerHTML = '', remover e recriar o nó é mais rápido no C++
            sandbox.remove(); 
        }
    }
};
