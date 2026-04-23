
     /**
 * MOD_FACTORY.JS — Gerenciador de Cenários
 * Importa e registra todos os módulos de teste UAF para o PS4.
 */

// Importação de todos os cenários individuais
import scArrayOverflow from './sc_array_int_overflow.js';
import scAudioCtx from './sc_audio_ctx_close.js';
import scCssAnim from './sc_css_anim_removed.js';
import scCssCustom from './sc_css_custom_prop.js';
import scDomEvent from './sc_dom_event_removed.js';
import scIframeUaf from './sc_iframe_frame_uaf.js';
import scMediaSource from './sc_mediasource_uaf.js';
import scMessagePort from './sc_messageport_uaf.js';
import scNativeCallback from './sc_native_callback_uaf.js';
import scPromiseMicro from './sc_promise_microtask.js';
import scRegexpOverflow from './sc_regexp_overflow.js';
import scStringOverflow from './sc_string_int_overflow.js';
import scStructuredClone from './sc_structured_clone.js';
import scSvgFilter from './sc_svg_filter_uaf.js';
import scTreewalker from './sc_treewalker_confusion.js';
import scVideoFullscreen from './sc_video_fullscreen_remove.js';
import scWeakmapEphemeron from './sc_weakmap_ephemeron.js';

export const Factory = {
    buildScenarios: function() {
        const allScenarios = [
            scArrayOverflow,
            scAudioCtx,
            scCssAnim,
            scCssCustom,
            scDomEvent,
            scIframeUaf,
            scMediaSource,
            scMessagePort,
            scNativeCallback,
            scPromiseMicro,
            scRegexpOverflow,
            scStringOverflow,
            scStructuredClone,
            scSvgFilter,
            scTreewalker,
            scVideoFullscreen,
            scWeakmapEphemeron
        ];

        const activeList = [];

        allScenarios.forEach(s => {
            try {
                // Verifica se o cenário é suportado pelo navegador atual
                if (s.supported && s.supported() === false) {
                    console.log(`[Factory] Ignorando ${s.id}: API não suportada.`);
                    return;
                }
                activeList.push(s);
            } catch(e) {
                console.error(`[Factory] Erro ao carregar cenário ${s.id}:`, e);
            }
        });

        return activeList;
    }
};       

        
        
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

        
        return list;
    }
};
