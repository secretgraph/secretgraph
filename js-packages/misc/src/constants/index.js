"use strict";
exports.__esModule = true;
exports.mapEncryptionAlgorithms = exports.mapHashNames = exports.contentStates = exports.protectedActions = void 0;
exports.protectedActions = new Set(['storedUpdate']);
exports.contentStates = new Map([
    ['draft', { label: gettext('Draft') }],
    ['internal', { label: gettext('Internal') }],
    ['public', { label: gettext('Public') }],
]);
exports.mapHashNames = {
    sha512: { operationName: 'SHA-512', length: 512, serializedName: 'sha512' },
    'SHA-512': {
        operationName: 'SHA-512',
        length: 512,
        serializedName: 'sha512'
    },
    sha256: { operationName: 'SHA-256', length: 256, serializedName: 'sha256' },
    'SHA-256': {
        operationName: 'SHA-256',
        length: 256,
        serializedName: 'sha256'
    }
};
exports.mapEncryptionAlgorithms = {
    PBKDF2: { usages: ['deriveBits', 'deriveKey'] },
    'RSA-PSSprivate': { usages: ['sign'] },
    'RSA-PSSpublic': { usages: ['verify'] },
    'RSASSA-PKCS1-v1_5private': { usages: ['sign'] },
    'RSASSA-PKCS1-v1_5public': { usages: ['verify'] },
    ECDSAprivate: { usages: ['sign', 'deriveKey', 'deriveBits'] },
    ECDSApublic: { usages: ['verify', 'deriveKey', 'deriveBits'] },
    'RSA-OAEPprivate': { usages: ['decrypt'] },
    'RSA-OAEPpublic': { usages: ['encrypt'] },
    'AES-GCM': { usages: ['encrypt', 'decrypt'] }
};
//# sourceMappingURL=index.js.map