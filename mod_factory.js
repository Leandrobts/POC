import regexpOverflow from './sc_regexp_overflow.js';
import weakmapEphemeron from './sc_weakmap_ephemeron.js';

export const Factory = {
    buildScenarios: function() {
        const list = [];

        // Carrega APENAS os dois cenários vulneráveis confirmados no PS4 FW 13.50
        
        // 1. Bug do Yarr Interpreter (Integer Overflow)
        list.push(regexpOverflow);
        
        // 2. Bug da Ephemeron Table (Desync do GC)
        list.push(weakmapEphemeron);

        return list;
    }
};
