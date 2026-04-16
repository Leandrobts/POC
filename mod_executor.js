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
        // 1. Confusão de Tipos (Lógica Booleana)
        if (/^(is|has|can|should)/i.test(prop) && val !== undefined && val !== null && typeof val !== 'boolean') {
            return { action, val, reason: "Type Confusion: C++ retornou não-booleano." };
        }

        // 2. Vazamento de Ponteiro (Memory Leak no JSC)
        // Se um valor que deveria ser primitivo retorna um endereço alto
        if (typeof val === 'number' && val > 0x10000000 && val !== 2147483647 && val !== Infinity) {
            // Pode ser um endereço da base do WebKit (Slide) ou do heap do ArrayBuffer
            return { action, val: `0x${val.toString(16)}`, reason: "Leak: Endereço de memória bruto capturado!" };
        }

        // 3. Objeto C++ Destruído (UAF Indicator)
        // Se a API converteu nosso payload Mutator e destruiu o objeto subjacente,
        // ele pode retornar um primitivo inesperado.
        if (val === null && !prop.toLowerCase().includes('element')) {
            return { action, val, reason: "NullPointerException Lógico: Objeto possivelmente liberado (Free)." };
        }

        return null; // Nenhuma anomalia detectada
    }
};
