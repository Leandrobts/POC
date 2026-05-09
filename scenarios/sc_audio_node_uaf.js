/**
 * SC_AUDIO_NODE_UAF.JS
 * Categoria : MEDIA — Use-After-Free
 * Alvo      : WebCore::AudioNode / AudioContext C++ lifecycle
 * Técnica   : Cria AudioContext com nós conectados em grafo,
 *             fecha o contexto via close() e tenta operar sobre
 *             os AudioNodes cujo C++ foi liberado junto com o contexto.
 *             AudioNode mantém referência JS mesmo após AudioContext
 *             ser coletado pelo GC do WebCore.
 * Referência: WebKit Web Audio UAF pattern
 */

export default {
    id:          'AUDIO_NODE_UAF',
    category:    'MEDIA',
    risk:        'HIGH',
    description: 'AudioNode JS retém referência após AudioContext.close(). '
                + 'Testa acesso ao grafo C++ de áudio após contexto liberado.',

    _ctx:         null,
    _gain:        null,
    _osc:         null,
    _analyser:    null,

    // Numéricos
    _sampleRate:  -1,
    _gainValue:   -1,
    _freqValue:   -1,
    _fftSize:     -1,

    // Strings
    _state:       'pending',
    _closeErr:    'none',

    supported: function() {
        return typeof AudioContext !== 'undefined'
            || typeof webkitAudioContext !== 'undefined';
    },

    setup: async function() {
        this._sampleRate = -1; this._gainValue = -1;
        this._freqValue  = -1; this._fftSize   = -1;
        this._state = 'pending'; this._closeErr = 'none';

        const AC = window.AudioContext || window.webkitAudioContext;
        this._ctx      = new AC();
        this._gain     = this._ctx.createGain();
        this._osc      = this._ctx.createOscillator();
        this._analyser = this._ctx.createAnalyser();

        // Configura valores conhecidos
        this._gain.gain.value     = 0.5;
        this._osc.frequency.value = 440;
        this._analyser.fftSize    = 2048;

        // Conecta: oscillator → gain → analyser → destination
        this._osc.connect(this._gain);
        this._gain.connect(this._analyser);
        this._analyser.connect(this._ctx.destination);

        // Captura baseline
        this._sampleRate = this._ctx.sampleRate;
        this._gainValue  = this._gain.gain.value;
        this._freqValue  = this._osc.frequency.value;
        this._fftSize    = this._analyser.fftSize;
        this._state      = this._ctx.state;

        await new Promise(r => setTimeout(r, 0));
    },

    trigger: async function() {
        // Fecha o contexto — libera o grafo C++ de áudio
        try {
            await this._ctx.close();
        } catch(e) {
            this._closeErr = e.constructor.name;
        }

        // Tenta operar sobre nós cujo C++ foi liberado
        try { this._gain.gain.value = 9999; }     catch(_) {}
        try { this._osc.frequency.value = 0xFFFF; } catch(_) {}
        try { this._analyser.fftSize = 32768; }   catch(_) {}

        // Tenta reconectar nós após o close
        try { this._osc.connect(this._gain); }    catch(_) {}
        try { this._osc.start(); }                catch(_) {}

        await new Promise(r => setTimeout(r, 20));
    },

    probe: [
        // [0-3] estado do contexto após close
        s => s._ctx.state,                         // 'closed' esperado
        s => s._state,                             // baseline para comparar
        s => s._closeErr,                          // 'none' se fechou ok
        s => String(s._ctx.destination?.context === s._ctx),

        // [4-7] GainNode pós-close — gain.value não deve ter mudado para 9999
        s => s._gain.gain.value,                   // 0.5 esperado
        s => s._gainValue,                         // baseline
        s => s._gain.numberOfInputs,
        s => s._gain.numberOfOutputs,

        // [8-10] OscillatorNode pós-close
        s => s._osc.frequency.value,               // 440 esperado
        s => s._freqValue,                         // baseline
        s => s._osc.type,

        // [11-12] AnalyserNode
        s => s._analyser.fftSize,                  // 2048 esperado
        s => s._fftSize,                           // baseline

        // [13] sampleRate do contexto fechado
        s => s._ctx.sampleRate,
        s => s._sampleRate,
    ],

    cleanup: async function() {
        try { if (s._ctx?.state !== 'closed') await this._ctx?.close(); } catch(_) {}
        this._ctx = null; this._gain = null; this._osc = null; this._analyser = null;
        this._sampleRate = -1; this._gainValue = -1; this._freqValue = -1; this._fftSize = -1;
        this._state = 'pending'; this._closeErr = 'none';
    }
};
