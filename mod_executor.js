/**
 * MÓDULO 3: EXECUTOR & ANALYZER
 * Objetivo: Disparar os payloads do Mutator contra as instâncias da Factory.
 * Foco: Interceptar anomalias letais sem crashar a UI do PS4.
 */

export const Executor = {

    // Lista negra interna para evitar loops infinitos ou chamadas destrutivas à UI
    blacklist: ['constructor', 'reload', 'location', 'open', 'alert', 'close'],

    // O Motor Principal (Generator Function)
    run: function*(targets, payloads) {
        let testCount = 0;

        for (let target of targets) {
            let obj = target.instance;
            
            // Pega as propriedades da instância e do protótipo
            let props = [];
            try {
                let ownProps = Object.getOwnPropertyNames(obj);
                let protoProps = Object.getOwnPropertyNames(Object.getPrototypeOf(obj));
                props = [...new Set([...ownProps, ...protoProps])]; // Remove duplicatas
            } catch (e) { continue; }

            for (let prop of props) {
                if (this.blacklist.includes(prop) || prop.startsWith('on')) continue;

                // Avisa a UI sobre o alvo atual (yield de status)
                yield { type: 'STATUS', target: `${target.category} > ${target.name}.${prop}` };

                try {
                    let descriptor = Object.getOwnPropertyDescriptor(obj, prop);
                    // Pula getters complexos para evitar travamentos prematuros
                    if (descriptor && descriptor.get) continue; 

                    let member = obj[prop];

                    if (typeof member === 'function') {
                        // Fuzzing de Métodos (CALL)
                        for (let p of payloads) {
                            try {
                                // A MÁGICA ACONTECE AQUI: Disparo do payload!
                                let result = member.call(obj, p.val);
                                
                                // Analisa o resultado
                                let anomaly = this.analyze(prop, result, `CALL [${p.label}]`);
                                if (anomaly) {
                                    yield { type: 'ANOMALY', api: `${target.name}.${prop}`, ...anomaly };
                                }
                            } catch (e) {
                                // A maioria dos payloads vai gerar TypeErrors. Ignoramos.
                            }
                            testCount++;
                            if (testCount % 10 === 0) yield { type: 'TICK', count: testCount };
                        }
                    } else {
                        // Fuzzing de Propriedades (GET)
                        let anomaly = this.analyze(prop, member, "GET");
                        if (anomaly) {
                            yield { type: 'ANOMALY', api: `${target.name}.${prop}`, ...anomaly };
                        }
                        testCount++;
                        if (testCount % 10 === 0) yield { type: 'TICK', count: testCount };
                    }
                } catch (e) {}
            }
        }
        
        yield { type: 'FINISHED', count: testCount };
    },

    // O Analisador de Corrupção
    analyze: function(prop, val, action) {
        // 1. Confusão de Tipos (Regex corrigida para CamelCase: isReady, canPlay)
        if (/^(is|has|can|should)[A-Z]/.test(prop) && val !== undefined && val !== null && typeof val !== 'boolean') {
            return { action, val, reason: "Type Confusion: C++ retornou não-booleano." };
        }

        // 2. Vazamento de Ponteiro
        if (typeof val === 'number' && val > 0x10000000 && val !== 2147483647 && val !== Infinity) {
            return { action, val: `0x${val.toString(16)}`, reason: "Leak: Endereço bruto capturado!" };
        }

        // 3. Objeto C++ Destruído (UAF Indicator com Filtro Anti-Ruído)
        const expectedNulls = ['get', 'getContext', 'exec', 'match', 'getItem', 'querySelector'];
        if (val === null && !expectedNulls.includes(prop) && !prop.toLowerCase().includes('element')) {
            return { action, val, reason: "Possível UAF: C++ retornou Null inesperado." };
        }

        return null;
}
};
