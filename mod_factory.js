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
