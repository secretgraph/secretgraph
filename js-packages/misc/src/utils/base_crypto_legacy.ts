import { unserializeToArrayBuffer, splitFirstOnly } from './encoding'
import { RawInput } from '../interfaces'
export type KeyInput = RawInput | CryptoKeyPair

export class KeyTypeError extends Error {}
export class UnknownAlgorithm extends Error {}
export class EmptyKeyError extends Error {}

function compareObjects(obj1: any, obj2: any) {
    const keys = new Set([...Object.keys(obj1), ...Object.keys(obj2)])
    for (const key of keys) {
        if (obj1[key] != obj2[key]) {
            return false
        }
    }
    return true
}
const mapKeyUsages: {
    readonly [algo: string]: readonly KeyUsage[]
} = {
    PBKDF2: ['deriveBits', 'deriveKey'],
    'RSA-PSSprivate': ['sign'],
    'RSA-PSSpublic': ['verify'],
    ECDSAprivate: ['sign', 'deriveKey', 'deriveBits'],
    ECDSApublic: ['verify', 'deriveKey', 'deriveBits'],
    'RSA-OAEPprivate': ['decrypt'],
    'RSA-OAEPpublic': ['encrypt'],
    'AES-GCM': ['encrypt', 'decrypt'],
}

// TODO: fix conversion of OEAP from SHA-256 to SHA-512
export async function toPublicKey(inp: KeyInput, params: any) {
    let _key: CryptoKey
    if (inp instanceof CryptoKey) {
        _key = inp
    } else if (
        (inp as CryptoKeyPair).privateKey &&
        (inp as CryptoKeyPair).publicKey
    ) {
        _key = (inp as Required<CryptoKeyPair>).privateKey
    } else if (params.name.startsWith('AES-')) {
        // symmetric
        if (!mapKeyUsages[params.name]) {
            throw Error('Algorithm not supported: ' + params.name)
        }
        return await crypto.subtle.importKey(
            'raw',
            await unserializeToArrayBuffer(inp as RawInput),
            params,
            true,
            mapKeyUsages[params.name]
        )
    } else {
        if (!mapKeyUsages[`${params.name}private`]) {
            throw Error('Algorithm not supported: ' + params.name)
        }
        _key = await crypto.subtle.importKey(
            'pkcs8' as const,
            await unserializeToArrayBuffer(inp as RawInput),
            params,
            true,
            mapKeyUsages[`${params.name}private`]
        )
    }
    const tempkey = await crypto.subtle.exportKey('jwk', _key)
    // bug: alg contains now invalid params and fails, so we just remove it
    delete tempkey.alg
    //tempkey.alg = tempkey.alg?.replace('-512', '')?.replace('-256', '')
    // remove private data from JWK
    delete tempkey.d
    delete tempkey.dp
    delete tempkey.dq
    delete tempkey.q
    delete tempkey.qi
    tempkey.key_ops = ['sign', 'verify', 'encrypt', 'decrypt']
    if (!mapKeyUsages[`${params.name}public`]) {
        throw Error(
            `Public version not available, should not happen: ${
                params.name
            } (private: ${mapKeyUsages[`${params.name}private`]})`
        )
    }
    return await crypto.subtle.importKey(
        'jwk',
        tempkey,
        params,
        true,
        mapKeyUsages[`${params.name}public`]
    )
}

export async function unserializeToCryptoKey(
    inp: KeyInput,
    params: any,
    type: 'privateKey' | 'publicKey' = 'publicKey',
    failInsteadConvert?: boolean
): Promise<CryptoKey> {
    let _data: ArrayBuffer, _result: CryptoKey
    if (inp instanceof CryptoKey) {
        if (
            compareObjects(inp.algorithm, params) &&
            type.startsWith(inp.type)
        ) {
            return inp
        }
        if (type == 'publicKey' && inp.type == 'private') {
            if (failInsteadConvert) {
                throw new KeyTypeError('Not a Public Key')
            }
            return await toPublicKey(inp, params)
        }
        _data = await unserializeToArrayBuffer(inp)
    } else if (
        (inp as CryptoKeyPair).privateKey &&
        (inp as CryptoKeyPair).publicKey
    ) {
        let temp2 = (inp as Required<CryptoKeyPair>)[type]
        if (compareObjects(temp2.algorithm, params)) {
            return temp2
        }
        _data = await unserializeToArrayBuffer(temp2)
    } else {
        _data = await unserializeToArrayBuffer(inp as RawInput)
    }
    if (!_data.byteLength) {
        throw new EmptyKeyError('Empty key')
    }
    if (params.name.startsWith('AES-')) {
        const entry = mapKeyUsages[params.name]
        if (!entry) {
            throw Error('Algorithm not supported: ' + params.name)
        }
        if (_data.byteLength > 32) {
            console.warn(
                'Invalid key length: ' + _data.byteLength + ' fixing...'
            )
            _data = _data.slice(-32)
        }
        // symmetric
        _result = await crypto.subtle.importKey(
            'raw' as const,
            _data,
            params,
            true,
            entry
        )
    } else {
        if (
            !mapKeyUsages[`${params.name}private`] ||
            !mapKeyUsages[`${params.name}public`]
        ) {
            throw new UnknownAlgorithm(
                `Algorithm not supported: ${params.name}`
            )
        }
        try {
            _result = await crypto.subtle.importKey(
                'pkcs8',
                _data,
                params,
                true,
                mapKeyUsages[`${params.name}private`]
            )
            if (type == 'publicKey' && _result.type == 'private') {
                if (failInsteadConvert) {
                    throw new KeyTypeError('Not a Public Key')
                }
                _result = await toPublicKey(_result, params)
            }
        } catch (exc) {
            if (exc instanceof KeyTypeError) {
                throw exc
            }
            if (type == 'publicKey') {
                try {
                    // serialize publicKey
                    _result = await crypto.subtle.importKey(
                        'spki',
                        _data,
                        params,
                        true,
                        mapKeyUsages[`${params.name}public`]
                    )
                } catch (exc_inner) {
                    console.debug(
                        'error importing, parameters: ',
                        params,
                        _data,
                        mapKeyUsages[`${params.name}public`],
                        exc_inner.stack
                    )
                    throw exc_inner
                }
            } else {
                console.debug(
                    'error invalid, parameters: ',
                    params,
                    _data,
                    mapKeyUsages[`${params.name}public`],
                    exc,
                    exc.stack
                )
                throw Error('Not a PrivateKey')
            }
        }
    }
    return _result
}
