/**
 * SC_CRYPTO_SUBTLE_UAF.JS
 * Categoria : CRYPTO — Use-After-Free / Info Leak
 * Alvo      : WebCore::SubtleCrypto / CryptoAlgorithm C++ lifecycle
 * Técnica   : Inicia operações crypto assíncronas (importKey, deriveBits,
 *             encrypt) e destrói o contexto antes que completem.
 *             O CryptoOperation C++ pode manter ponteiro para buffers
 *             JS que foram coletados durante a operação async.
 *             Também testa exportKey de CryptoKey após o contexto ser
 *             re-utilizado, tentando vazar material de chave via buffer stale.
 * Referência: WebKit SubtleCrypto async operation UAF pattern
 */

export default {
    id:          'CRYPTO_SUBTLE_UAF',
    category:    'CRYPTO',
    risk:        'HIGH',
    description: 'SubtleCrypto.importKey/deriveBits com contexto descartado mid-operation. '
                + 'Testa CryptoOperation C++ stale e possível info leak de material de chave.',

    _key:        null,
    _derivedBuf: null,

    // Strings
    _importResult:  'pending',
    _deriveResult:  'pending',
    _exportResult:  'pending',
    _encryptResult: 'pending',

    // Numéricos
    _keyLen:     -1,
    _derivedLen: -1,
    _firstByte:  -1,   // primeiro byte do material derivado

    supported: function() {
        return typeof crypto !== 'undefined'
            && typeof crypto.subtle !== 'undefined';
    },

    setup: async function() {
        this._key = null; this._derivedBuf = null;
        this._importResult  = 'pending'; this._deriveResult   = 'pending';
        this._exportResult  = 'pending'; this._encryptResult  = 'pending';
        this._keyLen = -1; this._derivedLen = -1; this._firstByte = -1;
        await new Promise(r => setTimeout(r, 0));
    },

    trigger: async function() {
        // A: importKey de raw bytes para HMAC
        try {
            const rawKey = new Uint8Array(32);
            crypto.getRandomValues(rawKey);

            this._key = await crypto.subtle.importKey(
                'raw', rawKey,
                { name: 'HMAC', hash: 'SHA-256' },
                true,   // extractable — para tentar exportar depois
                ['sign', 'verify']
            );
            this._importResult = this._key ? 'ok' : 'null';
            this._keyLen = rawKey.byteLength;

            // Descarta o buffer raw imediatamente após import
            rawKey.fill(0);
        } catch(e) {
            this._importResult = e.constructor.name;
        }

        // B: PBKDF2 deriveBits para testar uso de buffer após operação
        try {
            const passRaw = new TextEncoder().encode('password-canary');
            const passKey = await crypto.subtle.importKey(
                'raw', passRaw,
                { name: 'PBKDF2' },
                false,
                ['deriveBits']
            );

            // Descarta passRaw antes que deriveBits termine
            const derivePromise = crypto.subtle.deriveBits(
                {
                    name: 'PBKDF2',
                    salt: new Uint8Array(16),
                    iterations: 1,   // mínimo para não travar o PS4
                    hash: 'SHA-256'
                },
                passKey,
                256
            );

            this._derivedBuf = await derivePromise;
            this._derivedLen  = this._derivedBuf.byteLength;
            this._firstByte   = new Uint8Array(this._derivedBuf)[0];
            this._deriveResult = 'ok';
        } catch(e) {
            this._deriveResult = e.constructor.name;
        }

        // C: exportKey do HMAC key (tenta vazar material)
        if (this._key) {
            try {
                const exported = await crypto.subtle.exportKey('raw', this._key);
                this._exportResult = `len=${exported.byteLength}`;
                this._keyLen       = exported.byteLength;
            } catch(e) {
                this._exportResult = e.constructor.name;
            }
        }

        // D: sign com key válida e dados gigantes
        if (this._key) {
            try {
                const bigData = new Uint8Array(1024 * 1024);   // 1MB
                crypto.getRandomValues(bigData.subarray(0, 32));
                const sig = await crypto.subtle.sign('HMAC', this._key, bigData);
                this._encryptResult = `sig_len=${sig.byteLength}`;
            } catch(e) {
                this._encryptResult = e.constructor.name;
            }
        }

        await new Promise(r => setTimeout(r, 0));
    },

    probe: [
        // [0-3] strings dos resultados crypto
        s => s._importResult,
        s => s._deriveResult,
        s => s._exportResult,
        s => s._encryptResult,

        // [4-6] numéricos
        s => s._keyLen,
        s => s._derivedLen,
        s => s._firstByte,   // byte do material derivado — se mudar = info leak

        // [7-9] key object intacto?
        s => String(s._key instanceof CryptoKey),
        s => s._key?.type      ?? 'null',
        s => s._key?.algorithm?.name ?? 'null',

        // [10-11] buffer derivado
        s => s._derivedBuf ? new Uint8Array(s._derivedBuf)[0] : -1,
        s => s._derivedBuf ? new Uint8Array(s._derivedBuf)[31] : -1,
    ],

    cleanup: async function() {
        this._key = null; this._derivedBuf = null;
        this._importResult  = 'pending'; this._deriveResult   = 'pending';
        this._exportResult  = 'pending'; this._encryptResult  = 'pending';
        this._keyLen = -1; this._derivedLen = -1; this._firstByte = -1;
    }
};
