export default {
    id:       'ARRAY_MATH_INTEGER_OVERFLOW',
    category: 'Boundary',
    risk:     'HIGH',
    description:
        'Integer overflow em operações de array sem loops (O(1)). ' +
        'Testa push() em array length=0xFFFFFFFF, splice() com índice near INT_MIN, ' +
        'TypedArray subarray offset+length overflow, e ArrayBuffer.transfer().',

    setup: function() {
        this.results = {};
        this.buffer = new ArrayBuffer(16);
    },

    trigger: function() {
        // A: push() overflow (0xFFFFFFFF + 1 wraps para 0)
        try {
            const arr = [];
            arr.length = 0xFFFFFFFF;
            arr.push(1337);
            this.results.pushLen = arr.length;
        } catch(e) { this.results.pushErr = e.constructor.name; }

        // B: splice() com índice near INT_MIN (underflow de signed 32-bit)
        try {
            const arr = [1, 2, 3, 4, 5];
            arr.splice(-0x80000001, 1); 
            this.results.spliceLen = arr.length;
        } catch(e) { this.results.spliceErr = e.constructor.name; }

        // C: slice() com combinação de indices que somam > UINT32_MAX
        try {
            const arr = new Array(100).fill(1.1);
            const r = arr.slice(0xFFFFFFF0, 0xFFFFFFFF);
            this.results.sliceLen = r.length;
        } catch(e) { this.results.sliceErr = e.constructor.name; }

        // D: TypedArray subarray com offset+length overflow
        try {
            const ta = new Uint8Array(this.buffer);
            this.results.subArr = ta.subarray(0xFFFFFFF0, 0xFFFFFFFF);
            this.results.subArrLen = this.results.subArr?.byteLength;
        } catch(e) { this.results.subArrErr = e.constructor.name; }

        // E: DataView com offset gigante
        try {
            this.results.dataView = new DataView(this.buffer, 0xFFFFFFFF, 1);
        } catch(e) { this.results.dataViewErr = e.constructor.name; }

        // F: TypedArray constructor com byteOffset near MAX_SAFE_INTEGER
        try {
            const ab = new ArrayBuffer(8);
            this.results.bigOffsetView = new Uint8Array(ab, Number.MAX_SAFE_INTEGER - 7, 1);
        } catch(e) { this.results.bigOffsetErr = e.constructor.name; }
    },

    probe: [
        s => s.results.pushLen ?? s.results.pushErr,
        s => s.results.spliceLen ?? s.results.spliceErr,
        s => s.results.sliceLen ?? s.results.sliceErr,
        s => s.results.subArrLen ?? s.results.subArrErr,
        s => s.results.dataView ? s.results.dataView.byteOffset : s.results.dataViewErr,
        s => s.results.bigOffsetView ? s.results.bigOffsetView.byteOffset : s.results.bigOffsetErr,
        s => { try { return s.results.subArr ? s.results.subArr[0] : null; } catch(e) { return e.constructor.name; } },
    ],

    cleanup: function() {
        this.results = {};
        this.buffer  = null;
    }
};
