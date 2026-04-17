/**
 * CENÁRIO: AUDIO_CTX_CLOSE_NODE_ACCESS
 * Superfície C++: AudioContext.cpp / AudioNode.cpp / AudioParam.cpp
 * Risco: HIGH
 *
 * Diferença para a versão genérica:
 *   - A versão anterior fazia `await ctx.close()` e SÓ DEPOIS acessava os nodes.
 *     Isso é ineficaz: quando o await completa, o close() já terminou e o
 *     WebKit já deve ter tratado os dangling pointers internamente.
 *   - A versão robusta dispara close() SEM await e imediatamente captura
 *     leituras de AudioParam enquanto o grafo está sendo destruído
 *     (race condition real entre o teardown C++ e o acesso JS).
 *   - Segundo round: after close() completo, acessa nodes novamente para
 *     detectar InvalidStateError vs retorno de valor stale.
 *   - Adiciona ScriptProcessorNode (deprecated mas presente no PS4) que
 *     mantém buffer circular nativo — superfície extra de UAF.
 *
 * Ciclo de vida C++ relevante:
 *   AudioContext::close() → agenda destruição assíncrona do grafo
 *   AudioNode::~AudioNode() → chama disconnect() em cada conexão
 *   AudioParam ainda referenciado pelo JS pode chamar value() sobre
 *   AudioParamTimeline* freed durante a fase de destruição.
 */

export default {
    id:       'AUDIO_CTX_CLOSE_NODE_ACCESS',
    category: 'WebAudio',
    risk:     'HIGH',
    description:
        'AudioContext.close() dispara destruição assíncrona do grafo C++. ' +
        'close() é chamado sem await e os AudioParams são lidos imediatamente, ' +
        'criando race condition real entre teardown nativo e acesso JS. ' +
        'Após close() completo, probes detectam InvalidStateError vs valor stale.',

    setup: async function() {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC();

        // Grafo completo — mais conexões = mais ponteiros para freed
        this.osc    = this.ctx.createOscillator();
        this.biq    = this.ctx.createBiquadFilter();
        this.gain   = this.ctx.createGain();
        this.dyn    = this.ctx.createDynamicsCompressor();
        this.delay  = this.ctx.createDelay(1.0);
        this.wave   = this.ctx.createWaveShaper();
        this.panner = this.ctx.createPanner();

        // ScriptProcessorNode: mantém buffer nativo de audio — UAF específico
        try {
            this.script = this.ctx.createScriptProcessor?.(256, 1, 1);
            if (this.script) this.script.onaudioprocess = () => {};
        } catch(e) {}

        // Conecta grafo em cadeia
        this.osc.connect(this.biq);
        this.biq.connect(this.gain);
        this.gain.connect(this.delay);
        this.delay.connect(this.wave);
        this.wave.connect(this.panner);
        this.panner.connect(this.dyn);
        this.dyn.connect(this.ctx.destination);
        if (this.script) {
            this.gain.connect(this.script);
            this.script.connect(this.ctx.destination);
        }

        this.osc.start();

        // Captura leituras de baseline com contexto ativo
        this.raceResults = [];
    },

    trigger: async function() {
        // ROUND 1: Race — dispara close() e lê params DURANTE o teardown
        const closePromise = this.ctx.close(); // NÃO await aqui

        // Lê imediatamente durante o teardown assíncrono
        const raceProbes = [
            () => this.osc.frequency.value,
            () => this.osc.detune.value,
            () => this.biq.frequency.value,
            () => this.biq.Q.value,
            () => this.gain.gain.value,
            () => this.dyn.threshold.value,
            () => this.dyn.ratio.value,
            () => this.delay.delayTime.value,
            () => this.panner.panningModel,
            () => this.ctx.state,
        ];

        for (const fn of raceProbes) {
            try { this.raceResults.push({ ok: true, val: fn() }); }
            catch(e) { this.raceResults.push({ ok: false, err: e.constructor.name }); }
        }

        // Aguarda close() completar para o round 2 (probes após free total)
        await closePromise;
    },

    probe: [
        // ROUND 2: Acesso após close() completo
        // InvalidStateError onde baseline era válido = UAF candidate
        s => s.osc.frequency.value,
        s => s.osc.detune.value,
        s => s.osc.type,
        s => s.biq.frequency.value,
        s => s.biq.Q.value,
        s => s.biq.gain.value,
        s => s.biq.type,
        s => s.gain.gain.value,
        s => s.dyn.threshold.value,
        s => s.dyn.ratio.value,
        s => s.dyn.knee.value,
        s => s.dyn.attack.value,
        s => s.dyn.release.value,
        s => s.delay.delayTime.value,
        s => s.wave.curve,
        s => s.panner.panningModel,
        s => s.panner.positionX?.value,
        // context ainda referenciado pelo node — ponteiro para ctx fechado
        s => s.osc.context,
        s => s.osc.context?.state,
        s => s.osc.numberOfInputs,
        s => s.osc.numberOfOutputs,
        s => s.osc.channelCount,
        s => s.osc.channelCountMode,
        // Race results — anômalos se teardown não sincronizou
        s => s.raceResults.filter(r => !r.ok).length,
    ],

    cleanup: function() {}
};
