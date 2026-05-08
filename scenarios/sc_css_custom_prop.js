/**
 * SC_CSS_CUSTOM_PROP.JS
 * Categoria : DOM/STYLE — Use-After-Free / Type Confusion
 * Alvo      : WebCore::CSSCustomPropertyValue / StyleProperties
 * Técnica   : Lê e modifica CSS custom properties (--var) num elemento
 *             desanexado enquanto o motor tenta recalcular o estilo.
 *             O CSSStyleDeclaration pode manter ponteiro stale para o
 *             PropertySet do C++ após o elemento ser coletado.
 * Referência: Padrão de bug em StyleProperties lifecycle no WebKit
 */

export default {
    id:          'CSS_CUSTOM_PROP_UAF',
    category:    'DOM/STYLE',
    risk:        'MEDIUM',
    description: 'CSSStyleDeclaration retém ponteiro para PropertySet '
                + 'de elemento desanexado. Testa leitura de --custom-var pós-free.',

    /* ── estado interno ──────────────────────────────────────────────── */
    _el:       null,
    _clone:    null,
    _computed: null,

    supported: function() {
        return typeof CSS !== 'undefined'
            && typeof CSS.supports === 'function'
            && CSS.supports('--x', '1');
    },

    /* ── setup ──────────────────────────────────────────────────────── */
    setup: async function() {
        this._el = document.createElement('div');
        // Define várias custom properties com valores intencionais
        this._el.style.setProperty('--uaf-int',    '42');
        this._el.style.setProperty('--uaf-color',  '#deadbe');
        this._el.style.setProperty('--uaf-calc',   'calc(10px + 5%)');
        this._el.style.setProperty('--uaf-string', '"canary_value"');
        this._el.style.setProperty('--uaf-list',   '1 2 3 4');

        document.body.appendChild(this._el);

        // Clona para ter referência ao CSSStyleDeclaration separado
        this._clone = this._el.cloneNode(true);

        // Obtém ComputedStyle ANTES de remover
        this._computed = window.getComputedStyle(this._el);

        void this._el.offsetWidth; // força layout
        await new Promise(r => setTimeout(r, 0));
    },

    /* ── trigger ─────────────────────────────────────────────────────── */
    trigger: async function() {
        // Remove do DOM — libera o nó do render tree
        this._el.remove();

        // Força recálculo de estilo no documento (pode liberar o PropertySet)
        document.body.style.setProperty('--uaf-trigger', Date.now().toString());
        void document.body.offsetHeight;

        // Tenta sobrescrever a custom property no elemento desanexado
        try {
            this._el.style.setProperty('--uaf-int', '0xDEADBEEF');
        } catch(_) {}

        await new Promise(r => setTimeout(r, 0));
    },

    /* ── probes ──────────────────────────────────────────────────────── */
    probe: [
        // [0-4] leitura das custom props via style inline (objeto desanexado)
        s => s._el.style.getPropertyValue('--uaf-int'),
        s => s._el.style.getPropertyValue('--uaf-color'),
        s => s._el.style.getPropertyValue('--uaf-calc'),
        s => s._el.style.getPropertyValue('--uaf-string'),
        s => s._el.style.getPropertyValue('--uaf-list'),

        // [5-7] leitura via ComputedStyle obtida antes da remoção
        s => s._computed.getPropertyValue('--uaf-int'),
        s => s._computed.getPropertyValue('--uaf-color'),
        s => typeof s._computed.getPropertyValue('--uaf-calc'),

        // [8-10] estado do elemento
        s => s._el.isConnected,
        s => s._el.style.length,
        s => s._el.style.cssText.length,

        // [11-12] clone não deve ter sido afetado
        s => s._clone.style.getPropertyValue('--uaf-int'),
        s => s._clone.style.length,

        // [13] contagem de propriedades no style object
        s => s._el.style.length,
    ],

    /* ── cleanup ─────────────────────────────────────────────────────── */
    cleanup: async function() {
        document.body.style.removeProperty('--uaf-trigger');
        this._el       = null;
        this._clone    = null;
        this._computed = null;
    }
};
