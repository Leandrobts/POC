export function build_leak_probe(size) {
    // Garante que o tamanho é múltiplo de 4 para Uint32Array
    if (size % 4 !== 0) size += (4 - (size % 4));
    
    const buffer = new Uint32Array(size / 4);
    
    // Preenche com padrão misto:
    // 0x41414141 (Marcador)
    // 0x00000000 (Lugar para o Kernel escrever ponteiros)
    
    for (let i = 0; i < buffer.length; i++) {
        if (i % 2 === 0) buffer[i] = 0x41414141; // AAAA
        else buffer[i] = 0x00000000; // Zeros (Esperando Leak)
    }
    
    return buffer;
}
