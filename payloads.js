function build_leak_payload(sizeInBytes) {
    const elementCount = Math.floor(sizeInBytes / 8);
    const arr = new Array(elementCount);
    
    // 1.1 = 0x3FF199999999999A (Seguro para Userland)
    for(let i=0; i<arr.length; i++) {
        arr[i] = 1.1; 
    }
    
    return arr;
}
