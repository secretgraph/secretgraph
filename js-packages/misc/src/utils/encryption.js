"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __values = (this && this.__values) || function(o) {
    var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
    if (m) return m.call(o);
    if (o && typeof o.length === "number") return {
        next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
        }
    };
    throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
};
var __read = (this && this.__read) || function (o, n) {
    var m = typeof Symbol === "function" && o[Symbol.iterator];
    if (!m) return o;
    var i = m.call(o), r, ar = [], e;
    try {
        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
    }
    catch (error) { e = { error: error }; }
    finally {
        try {
            if (r && !r.done && (m = i["return"])) m.call(i);
        }
        finally { if (e) throw e.error; }
    }
    return ar;
};
var __spreadArray = (this && this.__spreadArray) || function (to, from) {
    for (var i = 0, il = from.length, j = to.length; i < il; i++, j++)
        to[j] = from[i];
    return to;
};
exports.__esModule = true;
exports.decryptFirstPreKey = exports.decryptPreKeys = exports.encryptPreKey = exports.extractTags = exports.extractUnencryptedTags = exports.decryptTag = exports.decryptTagRaw = exports.encryptTag = exports.derivePW = exports.decryptAESGCM = exports.encryptAESGCM = exports.decryptRSAOEAP = exports.encryptRSAOEAP = exports.unserializeToCryptoKey = exports.serializeToBase64 = exports.unserializeToArrayBuffer = exports.toPublicKey = exports.toPBKDF2key = exports.hashObject = exports.findWorkingHashAlgorithms = void 0;
var Constants = __importStar(require("../constants"));
var IterableOps = __importStar(require("./iterable"));
var misc_1 = require("./misc");
function findWorkingHashAlgorithms(hashAlgorithms) {
    var e_1, _a;
    var hashAlgos = [];
    try {
        for (var hashAlgorithms_1 = __values(hashAlgorithms), hashAlgorithms_1_1 = hashAlgorithms_1.next(); !hashAlgorithms_1_1.done; hashAlgorithms_1_1 = hashAlgorithms_1.next()) {
            var algo = hashAlgorithms_1_1.value;
            var mappedName = Constants.mapHashNames[algo];
            if (mappedName) {
                hashAlgos.push(mappedName.operationName);
            }
        }
    }
    catch (e_1_1) { e_1 = { error: e_1_1 }; }
    finally {
        try {
            if (hashAlgorithms_1_1 && !hashAlgorithms_1_1.done && (_a = hashAlgorithms_1["return"])) _a.call(hashAlgorithms_1);
        }
        finally { if (e_1) throw e_1.error; }
    }
    return hashAlgos;
}
exports.findWorkingHashAlgorithms = findWorkingHashAlgorithms;
function hashObject(obj, hashAlgorithm) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, _b, _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    _a = serializeToBase64;
                    _c = (_b = crypto.subtle).digest;
                    _d = [hashAlgorithm];
                    return [4 /*yield*/, unserializeToArrayBuffer(obj)];
                case 1: return [4 /*yield*/, _a.apply(void 0, [_c.apply(_b, _d.concat([_e.sent()]))])];
                case 2: return [2 /*return*/, _e.sent()];
            }
        });
    });
}
exports.hashObject = hashObject;
function toPBKDF2key(inp) {
    return __awaiter(this, void 0, void 0, function () {
        var data, _inp;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, inp];
                case 1:
                    _inp = _a.sent();
                    if (!(typeof _inp === 'string')) return [3 /*break*/, 2];
                    data = misc_1.utf8encoder.encode(_inp);
                    return [3 /*break*/, 6];
                case 2:
                    if (!(_inp instanceof ArrayBuffer ||
                        _inp.buffer instanceof ArrayBuffer)) return [3 /*break*/, 3];
                    data = _inp;
                    return [3 /*break*/, 6];
                case 3:
                    if (!(_inp instanceof File)) return [3 /*break*/, 5];
                    return [4 /*yield*/, _inp.arrayBuffer()];
                case 4:
                    data = _a.sent();
                    return [3 /*break*/, 6];
                case 5:
                    if (_inp instanceof CryptoKey) {
                        if (_inp.algorithm.name != 'PBKDF2') {
                            throw Error('Invalid algorithm: ' + _inp.algorithm.name);
                        }
                        return [2 /*return*/, _inp];
                    }
                    else {
                        throw Error("Invalid input: " + _inp + " (" + _inp.constructor + ")");
                    }
                    _a.label = 6;
                case 6: return [2 /*return*/, crypto.subtle.importKey('raw', data, 'PBKDF2', false, Constants.mapEncryptionAlgorithms.PBKDF2.usages)];
            }
        });
    });
}
exports.toPBKDF2key = toPBKDF2key;
function toPublicKey(inp, params) {
    return __awaiter(this, void 0, void 0, function () {
        var _key, _inp, _a, _b, _c, _d, _e, _f, tempkey;
        return __generator(this, function (_g) {
            switch (_g.label) {
                case 0: return [4 /*yield*/, inp];
                case 1:
                    _inp = _g.sent();
                    if (!(_inp instanceof CryptoKey)) return [3 /*break*/, 2];
                    _key = _inp;
                    return [3 /*break*/, 9];
                case 2:
                    if (!(_inp.privateKey &&
                        _inp.publicKey)) return [3 /*break*/, 3];
                    _key = _inp.privateKey;
                    return [3 /*break*/, 9];
                case 3:
                    if (!params.name.startsWith('AES-')) return [3 /*break*/, 6];
                    // symmetric
                    if (!Constants.mapEncryptionAlgorithms[params.name]) {
                        throw Error('Algorithm not supported: ' + params.name);
                    }
                    _b = (_a = crypto.subtle).importKey;
                    _c = ['raw'];
                    return [4 /*yield*/, unserializeToArrayBuffer(_inp)];
                case 4: return [4 /*yield*/, _b.apply(_a, _c.concat([_g.sent(), params,
                        true,
                        Constants.mapEncryptionAlgorithms[params.name].usages]))];
                case 5: return [2 /*return*/, _g.sent()];
                case 6:
                    if (!Constants.mapEncryptionAlgorithms[params.name + "private"]) {
                        throw Error('Algorithm not supported: ' + params.name);
                    }
                    _e = (_d = crypto.subtle).importKey;
                    _f = ['pkcs8'];
                    return [4 /*yield*/, unserializeToArrayBuffer(_inp)];
                case 7: return [4 /*yield*/, _e.apply(_d, _f.concat([_g.sent(), params,
                        true,
                        Constants.mapEncryptionAlgorithms[params.name + "private"].usages]))];
                case 8:
                    _key = _g.sent();
                    _g.label = 9;
                case 9: return [4 /*yield*/, crypto.subtle.exportKey('jwk', _key)
                    // remove private data from JWK
                ];
                case 10:
                    tempkey = _g.sent();
                    // remove private data from JWK
                    delete tempkey.d;
                    delete tempkey.dp;
                    delete tempkey.dq;
                    delete tempkey.q;
                    delete tempkey.qi;
                    tempkey.key_ops = ['sign', 'verify', 'encrypt', 'decrypt'];
                    if (!Constants.mapEncryptionAlgorithms[params.name + "public"]) {
                        throw Error("Public version not available, should not happen: " + params.name + " (private: " + Constants.mapEncryptionAlgorithms[params.name + "private"] + ")");
                    }
                    return [4 /*yield*/, crypto.subtle.importKey('jwk', tempkey, params, true, Constants.mapEncryptionAlgorithms[params.name + "public"].usages)];
                case 11: return [2 /*return*/, _g.sent()];
            }
        });
    });
}
exports.toPublicKey = toPublicKey;
function unserializeToArrayBuffer(inp) {
    return __awaiter(this, void 0, void 0, function () {
        var _inp, _result, _data, _finp, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, inp];
                case 1:
                    _inp = _b.sent();
                    if (!(typeof _inp === 'string')) return [3 /*break*/, 2];
                    _result = Buffer.from(_inp, 'base64').buffer;
                    return [3 /*break*/, 14];
                case 2:
                    _data = void 0;
                    _finp = _inp.data;
                    if (_finp &&
                        (_finp instanceof ArrayBuffer ||
                            _finp.buffer instanceof ArrayBuffer)) {
                        _data = _finp;
                    }
                    else {
                        _data = _inp;
                    }
                    if (!(_data instanceof ArrayBuffer ||
                        _data.buffer instanceof ArrayBuffer)) return [3 /*break*/, 3];
                    _result = _data;
                    return [3 /*break*/, 14];
                case 3:
                    if (!(_data instanceof Blob)) return [3 /*break*/, 5];
                    return [4 /*yield*/, _data.arrayBuffer()];
                case 4:
                    _result = _b.sent();
                    return [3 /*break*/, 14];
                case 5:
                    if (!(_data instanceof CryptoKey)) return [3 /*break*/, 13];
                    if (!_data.extractable) {
                        throw Error('Cannot extract key (extractable=false)');
                    }
                    _a = _data.type;
                    switch (_a) {
                        case 'public': return [3 /*break*/, 6];
                        case 'private': return [3 /*break*/, 8];
                    }
                    return [3 /*break*/, 10];
                case 6: return [4 /*yield*/, crypto.subtle.exportKey('spki', _data)];
                case 7:
                    // serialize publicKey
                    _result = _b.sent();
                    return [3 /*break*/, 12];
                case 8: return [4 /*yield*/, crypto.subtle.exportKey('pkcs8', _data)];
                case 9:
                    _result = _b.sent();
                    return [3 /*break*/, 12];
                case 10: return [4 /*yield*/, crypto.subtle.exportKey('raw', _data)];
                case 11:
                    _result = _b.sent();
                    _b.label = 12;
                case 12: return [3 /*break*/, 14];
                case 13: throw Error("Invalid input: " + _inp + " (" + _inp.constructor + ")");
                case 14: return [2 /*return*/, _result];
            }
        });
    });
}
exports.unserializeToArrayBuffer = unserializeToArrayBuffer;
function serializeToBase64(inp) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _b = (_a = Buffer).from;
                    return [4 /*yield*/, unserializeToArrayBuffer(inp)];
                case 1: return [2 /*return*/, _b.apply(_a, [_c.sent()]).toString('base64')];
            }
        });
    });
}
exports.serializeToBase64 = serializeToBase64;
function compareObjects(obj1, obj2) {
    var e_2, _a;
    var keys = new Set(__spreadArray(__spreadArray([], __read(Object.keys(obj1))), __read(Object.keys(obj2))));
    try {
        for (var keys_1 = __values(keys), keys_1_1 = keys_1.next(); !keys_1_1.done; keys_1_1 = keys_1.next()) {
            var key = keys_1_1.value;
            if (obj1[key] != obj2[key]) {
                return false;
            }
        }
    }
    catch (e_2_1) { e_2 = { error: e_2_1 }; }
    finally {
        try {
            if (keys_1_1 && !keys_1_1.done && (_a = keys_1["return"])) _a.call(keys_1);
        }
        finally { if (e_2) throw e_2.error; }
    }
    return true;
}
var KeyTypeError = /** @class */ (function (_super) {
    __extends(KeyTypeError, _super);
    function KeyTypeError() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    return KeyTypeError;
}(Error));
function unserializeToCryptoKey(inp, params, type, failInsteadConvert) {
    if (type === void 0) { type = 'publicKey'; }
    return __awaiter(this, void 0, void 0, function () {
        var _data, _result, temp1, temp2, exc_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, inp];
                case 1:
                    temp1 = _a.sent();
                    if (!(temp1 instanceof CryptoKey)) return [3 /*break*/, 5];
                    if (compareObjects(temp1.algorithm, params) &&
                        type.startsWith(temp1.type)) {
                        return [2 /*return*/, temp1];
                    }
                    if (!(type == 'publicKey' && temp1.type == 'private')) return [3 /*break*/, 3];
                    if (failInsteadConvert) {
                        throw new KeyTypeError('Not a Public Key');
                    }
                    return [4 /*yield*/, toPublicKey(temp1, params)];
                case 2: return [2 /*return*/, _a.sent()];
                case 3: return [4 /*yield*/, unserializeToArrayBuffer(temp1)];
                case 4:
                    _data = _a.sent();
                    return [3 /*break*/, 9];
                case 5:
                    if (!(temp1.privateKey &&
                        temp1.publicKey)) return [3 /*break*/, 7];
                    temp2 = temp1[type];
                    if (compareObjects(temp2.algorithm, params)) {
                        return [2 /*return*/, temp2];
                    }
                    return [4 /*yield*/, unserializeToArrayBuffer(temp2)];
                case 6:
                    _data = _a.sent();
                    return [3 /*break*/, 9];
                case 7: return [4 /*yield*/, unserializeToArrayBuffer(temp1)];
                case 8:
                    _data = _a.sent();
                    _a.label = 9;
                case 9:
                    if (!params.name.startsWith('AES-')) return [3 /*break*/, 11];
                    if (!Constants.mapEncryptionAlgorithms[params.name]) {
                        throw Error('Algorithm not supported: ' + params.name);
                    }
                    return [4 /*yield*/, crypto.subtle.importKey('raw', _data, params, true, Constants.mapEncryptionAlgorithms[params.name].usages)];
                case 10:
                    // symmetric
                    _result = _a.sent();
                    return [3 /*break*/, 20];
                case 11:
                    if (!Constants.mapEncryptionAlgorithms[params.name + "private"] ||
                        !Constants.mapEncryptionAlgorithms[params.name + "public"]) {
                        throw Error('Algorithm not supported: ' + params.name);
                    }
                    _a.label = 12;
                case 12:
                    _a.trys.push([12, 16, , 20]);
                    return [4 /*yield*/, crypto.subtle.importKey('pkcs8', _data, params, true, Constants.mapEncryptionAlgorithms[params.name + "private"]
                            .usages)];
                case 13:
                    _result = _a.sent();
                    if (!(type == 'publicKey' && _result.type == 'private')) return [3 /*break*/, 15];
                    if (failInsteadConvert) {
                        throw new KeyTypeError('Not a Public Key');
                    }
                    return [4 /*yield*/, toPublicKey(_result, params)];
                case 14:
                    _result = _a.sent();
                    _a.label = 15;
                case 15: return [3 /*break*/, 20];
                case 16:
                    exc_1 = _a.sent();
                    if (exc_1 instanceof KeyTypeError) {
                        throw exc_1;
                    }
                    if (!(type == 'publicKey')) return [3 /*break*/, 18];
                    return [4 /*yield*/, crypto.subtle.importKey('spki', _data, params, true, Constants.mapEncryptionAlgorithms[params.name + "public"]
                            .usages)];
                case 17:
                    // serialize publicKey
                    _result = _a.sent();
                    return [3 /*break*/, 19];
                case 18:
                    console.debug('error, parameters: ', _data, params, Constants.mapEncryptionAlgorithms[params.name + "public"]);
                    throw Error('Not a PrivateKey');
                case 19: return [3 /*break*/, 20];
                case 20: return [2 /*return*/, _result];
            }
        });
    });
}
exports.unserializeToCryptoKey = unserializeToCryptoKey;
function encryptRSAOEAP(options) {
    return __awaiter(this, void 0, void 0, function () {
        var _options, hashalgo, key, _a, _b, _c;
        var _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0: return [4 /*yield*/, options];
                case 1:
                    _options = _e.sent();
                    return [4 /*yield*/, _options.hashAlgorithm];
                case 2:
                    hashalgo = _e.sent();
                    if (!Constants.mapHashNames['' + hashalgo]) {
                        throw Error('hashalgorithm not supported: ' + hashalgo);
                    }
                    return [4 /*yield*/, unserializeToCryptoKey(_options.key, {
                            name: 'RSA-OAEP',
                            hash: Constants.mapHashNames['' + hashalgo].operationName
                        })];
                case 3:
                    key = _e.sent();
                    _d = {};
                    _b = (_a = crypto.subtle).encrypt;
                    _c = [{
                            name: 'RSA-OAEP'
                        },
                        key];
                    return [4 /*yield*/, unserializeToArrayBuffer(_options.data)];
                case 4: return [4 /*yield*/, _b.apply(_a, _c.concat([_e.sent()]))];
                case 5: return [2 /*return*/, (_d.data = _e.sent(),
                        _d.hashAlgorithm = hashalgo,
                        _d.key = key,
                        _d)];
            }
        });
    });
}
exports.encryptRSAOEAP = encryptRSAOEAP;
function decryptRSAOEAP(options) {
    return __awaiter(this, void 0, void 0, function () {
        var _options, hashValue, nonce, key, _key, split, _hashalgo, _a, _b, _c, _hashalgo, _d, _e, _f;
        var _g, _h, _j;
        return __generator(this, function (_k) {
            switch (_k.label) {
                case 0: return [4 /*yield*/, options];
                case 1:
                    _options = _k.sent();
                    hashValue = undefined, nonce = undefined;
                    return [4 /*yield*/, _options.key];
                case 2:
                    _key = _k.sent();
                    if (!(typeof _key === 'string')) return [3 /*break*/, 13];
                    split = _key.split(':');
                    _hashalgo = void 0;
                    _a = split.length;
                    switch (_a) {
                        case 1: return [3 /*break*/, 3];
                        case 2: return [3 /*break*/, 6];
                    }
                    return [3 /*break*/, 9];
                case 3: return [4 /*yield*/, _options.hashAlgorithm];
                case 4:
                    _hashalgo = _k.sent();
                    hashValue = Constants.mapHashNames['' + _hashalgo];
                    if (!hashValue) {
                        throw Error('hashalgorithm not supported: ' + _hashalgo);
                    }
                    return [4 /*yield*/, unserializeToCryptoKey(split[0], {
                            name: 'RSA-OAEP',
                            hash: hashValue.operationName
                        }, 'privateKey')];
                case 5:
                    key = _k.sent();
                    return [3 /*break*/, 12];
                case 6:
                    _hashalgo = split[0];
                    hashValue = Constants.mapHashNames['' + _hashalgo];
                    if (!hashValue) {
                        throw Error('hashalgorithm not supported: ' + _hashalgo);
                    }
                    ;
                    return [4 /*yield*/, unserializeToArrayBuffer(split[1])];
                case 7:
                    _b = [
                        _k.sent()
                    ];
                    return [4 /*yield*/, unserializeToCryptoKey(split[1], {
                            name: 'RSA-OAEP',
                            hash: hashValue.operationName
                        }, 'privateKey')];
                case 8:
                    _g = __read.apply(void 0, [_b.concat([
                            _k.sent()
                        ]), 2]), nonce = _g[0], key = _g[1];
                    return [3 /*break*/, 12];
                case 9:
                    ;
                    _c = [split[0]];
                    return [4 /*yield*/, unserializeToArrayBuffer(split[1])];
                case 10:
                    _h = __read.apply(void 0, [_c.concat([
                            _k.sent()
                        ]), 2]), _hashalgo = _h[0], nonce = _h[1];
                    hashValue = Constants.mapHashNames['' + _hashalgo];
                    if (!hashValue) {
                        throw Error('hashalgorithm not supported: ' + _hashalgo);
                    }
                    return [4 /*yield*/, unserializeToCryptoKey(split[2], {
                            name: 'RSA-OAEP',
                            hash: hashValue.operationName
                        }, 'privateKey')];
                case 11:
                    key = _k.sent();
                    return [3 /*break*/, 12];
                case 12: return [3 /*break*/, 16];
                case 13: return [4 /*yield*/, _options.hashAlgorithm];
                case 14:
                    _hashalgo = _k.sent();
                    hashValue = Constants.mapHashNames['' + _hashalgo];
                    if (!hashValue) {
                        Error('hashalgorithm not supported: ' + _hashalgo);
                    }
                    return [4 /*yield*/, unserializeToCryptoKey(_key, {
                            name: 'RSA-OAEP',
                            hash: hashValue.operationName
                        }, 'privateKey')];
                case 15:
                    key = _k.sent();
                    _k.label = 16;
                case 16:
                    _j = {};
                    _e = (_d = crypto.subtle).decrypt;
                    _f = [{
                            name: 'RSA-OAEP'
                        },
                        key];
                    return [4 /*yield*/, unserializeToArrayBuffer(_options.data)];
                case 17: return [4 /*yield*/, _e.apply(_d, _f.concat([_k.sent()]))];
                case 18: return [2 /*return*/, (_j.data = _k.sent(),
                        _j.key = key,
                        _j.hashAlgorithm = hashValue.serializedName,
                        _j.nonce = nonce,
                        _j)];
            }
        });
    });
}
exports.decryptRSAOEAP = decryptRSAOEAP;
function encryptAESGCM(options) {
    return __awaiter(this, void 0, void 0, function () {
        var _options, nonce, _a, key, data;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, options];
                case 1:
                    _options = _c.sent();
                    if (!_options.nonce) return [3 /*break*/, 3];
                    return [4 /*yield*/, unserializeToArrayBuffer(_options.nonce)];
                case 2:
                    _a = _c.sent();
                    return [3 /*break*/, 4];
                case 3:
                    _a = crypto.getRandomValues(new Uint8Array(13));
                    _c.label = 4;
                case 4:
                    nonce = _a;
                    return [4 /*yield*/, unserializeToCryptoKey(_options.key, {
                            name: 'AES-GCM'
                        }, 'privateKey' // secret so private key
                        )];
                case 5:
                    key = _c.sent();
                    return [4 /*yield*/, unserializeToArrayBuffer(_options.data)];
                case 6:
                    data = _c.sent();
                    _b = {};
                    return [4 /*yield*/, crypto.subtle.encrypt({
                            name: 'AES-GCM',
                            iv: nonce
                        }, key, data)];
                case 7: return [2 /*return*/, (_b.data = _c.sent(),
                        _b.key = key,
                        _b.nonce = nonce,
                        _b)];
            }
        });
    });
}
exports.encryptAESGCM = encryptAESGCM;
function decryptAESGCM(options) {
    return __awaiter(this, void 0, void 0, function () {
        var _options, _key, _nonce, _a, nonce, key, split, _b, data, exc_2;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, options];
                case 1:
                    _options = _c.sent();
                    return [4 /*yield*/, _options.key];
                case 2:
                    _key = _c.sent();
                    if (!_options.nonce) return [3 /*break*/, 4];
                    return [4 /*yield*/, unserializeToArrayBuffer(_options.nonce)];
                case 3:
                    _a = _c.sent();
                    return [3 /*break*/, 5];
                case 4:
                    _a = undefined;
                    _c.label = 5;
                case 5:
                    _nonce = _a;
                    if (!(typeof _key === 'string')) return [3 /*break*/, 15];
                    split = _key.split(':');
                    _b = split.length;
                    switch (_b) {
                        case 1: return [3 /*break*/, 6];
                        case 2: return [3 /*break*/, 8];
                    }
                    return [3 /*break*/, 11];
                case 6:
                    if (!_nonce) {
                        throw Error('No nonce found');
                    }
                    nonce = _nonce;
                    return [4 /*yield*/, unserializeToCryptoKey(split[0], {
                            name: 'AES-GCM'
                        }, 'privateKey')];
                case 7:
                    key = _c.sent();
                    return [3 /*break*/, 14];
                case 8: return [4 /*yield*/, unserializeToArrayBuffer(split[0])];
                case 9:
                    nonce = _c.sent();
                    return [4 /*yield*/, unserializeToCryptoKey(split[1], {
                            name: 'AES-GCM'
                        }, 'privateKey')];
                case 10:
                    key = _c.sent();
                    return [3 /*break*/, 14];
                case 11: return [4 /*yield*/, unserializeToArrayBuffer(split[1])];
                case 12:
                    nonce = _c.sent();
                    return [4 /*yield*/, unserializeToCryptoKey(split[2], {
                            name: 'AES-GCM'
                        }, 'privateKey')];
                case 13:
                    key = _c.sent();
                    return [3 /*break*/, 14];
                case 14: return [3 /*break*/, 17];
                case 15:
                    if (!_nonce) {
                        throw Error('No nonce found');
                    }
                    nonce = _nonce;
                    return [4 /*yield*/, unserializeToCryptoKey(_key, {
                            name: 'AES-GCM'
                        }, 'privateKey')];
                case 16:
                    key = _c.sent();
                    _c.label = 17;
                case 17:
                    _c.trys.push([17, 22, , 23]);
                    return [4 /*yield*/, unserializeToArrayBuffer(_options.data)];
                case 18:
                    data = _c.sent();
                    if (!(!data || data.byteLength == 0)) return [3 /*break*/, 19];
                    data = new Uint8Array();
                    return [3 /*break*/, 21];
                case 19: return [4 /*yield*/, crypto.subtle.decrypt({
                        name: 'AES-GCM',
                        iv: nonce
                    }, key, data)];
                case 20:
                    data = _c.sent();
                    _c.label = 21;
                case 21: return [2 /*return*/, {
                        data: data,
                        key: key,
                        nonce: nonce
                    }];
                case 22:
                    exc_2 = _c.sent();
                    console.debug('error, parameters: ', key, nonce, data);
                    throw exc_2;
                case 23: return [2 /*return*/];
            }
        });
    });
}
exports.decryptAESGCM = decryptAESGCM;
function derivePW(options) {
    return __awaiter(this, void 0, void 0, function () {
        var _options, key, salt, iterations, _a, _b, _hashalgo;
        var _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0: return [4 /*yield*/, options];
                case 1:
                    _options = _d.sent();
                    return [4 /*yield*/, toPBKDF2key(_options.pw)];
                case 2:
                    key = _d.sent();
                    return [4 /*yield*/, unserializeToArrayBuffer(_options.salt)];
                case 3:
                    salt = _d.sent();
                    _a = parseInt;
                    _b = '';
                    return [4 /*yield*/, _options.iterations];
                case 4:
                    iterations = _a.apply(void 0, [_b + (_d.sent())]);
                    return [4 /*yield*/, _options.hashAlgorithm];
                case 5:
                    _hashalgo = _d.sent();
                    if (!Constants.mapHashNames['' + _hashalgo]) {
                        throw Error('hashalgorithm not supported: ' + _hashalgo);
                    }
                    _c = {};
                    return [4 /*yield*/, crypto.subtle.deriveBits({
                            name: 'PBKDF2',
                            salt: salt,
                            iterations: iterations,
                            hash: Constants.mapHashNames['' + _hashalgo].operationName
                        }, key, 256 // cap at 256 for AESGCM compatibility
                        )];
                case 6: return [2 /*return*/, (_c.data = _d.sent(),
                        _c.key = key,
                        _c)];
            }
        });
    });
}
exports.derivePW = derivePW;
// use tag="" for flags
function encryptTag(options) {
    return __awaiter(this, void 0, void 0, function () {
        var tag, data, splitted, nonce, encrypted, tmp;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!(options.tag !== undefined)) return [3 /*break*/, 3];
                    return [4 /*yield*/, options.tag];
                case 1:
                    tag = _a.sent();
                    return [4 /*yield*/, options.data];
                case 2:
                    data = _a.sent();
                    return [3 /*break*/, 5];
                case 3: return [4 /*yield*/, options.data];
                case 4:
                    splitted = (_a.sent()).match(/^([^=]+)=(.*)/);
                    tag = splitted[1];
                    data = splitted[2];
                    _a.label = 5;
                case 5:
                    if (!data) {
                        throw Error('missing data');
                    }
                    if (!(options.encrypt && options.encrypt.has(tag))) return [3 /*break*/, 8];
                    nonce = crypto.getRandomValues(new Uint8Array(13));
                    return [4 /*yield*/, encryptAESGCM(__assign(__assign({}, options), { data: data, nonce: nonce }))];
                case 6:
                    encrypted = (_a.sent()).data;
                    tmp = new Uint8Array(nonce.byteLength + encrypted.byteLength);
                    tmp.set(new Uint8Array(nonce), 0);
                    tmp.set(new Uint8Array(encrypted), nonce.byteLength);
                    return [4 /*yield*/, serializeToBase64(tmp)
                        /**console.log(
                            tag,
                            await serializeToBase64(options.key as ArrayBuffer),
                            String.fromCharCode(
                                ...new Uint8Array(
                                    (
                                        await decryptTagRaw({
                                            data,
                                            key: options.key,
                                        })
                                    ).data
                                )
                            )
                        )*/
                    ];
                case 7:
                    data = _a.sent();
                    _a.label = 8;
                case 8:
                    if (!tag) {
                        // for flags
                        return [2 /*return*/, data];
                    }
                    return [2 /*return*/, tag + "=" + data];
            }
        });
    });
}
exports.encryptTag = encryptTag;
function decryptTagRaw(options) {
    return __awaiter(this, void 0, void 0, function () {
        var data, nonce, realdata;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, unserializeToArrayBuffer(options.data)];
                case 1:
                    data = _a.sent();
                    nonce = new Uint8Array(data.slice(0, 13));
                    realdata = data.slice(13);
                    return [4 /*yield*/, decryptAESGCM(__assign(__assign({}, options), { data: realdata, nonce: nonce }))];
                case 2: return [2 /*return*/, _a.sent()];
            }
        });
    });
}
exports.decryptTagRaw = decryptTagRaw;
function decryptTag(options) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, _, tag, b64data, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, options.data];
                case 1:
                    _a = __read.apply(void 0, [(_c.sent()).match(/^([^=]+?)=(.*)/), 3]), _ = _a[0], tag = _a[1], b64data = _a[2];
                    _b = [{}];
                    return [4 /*yield*/, decryptTagRaw(__assign(__assign({}, options), { data: b64data }))];
                case 2: return [2 /*return*/, __assign.apply(void 0, [__assign.apply(void 0, _b.concat([(_c.sent())])), { tag: tag }])];
            }
        });
    });
}
exports.decryptTag = decryptTag;
function extractUnencryptedTags(options) {
    return __awaiter(this, void 0, void 0, function () {
        var tags, _a, _b, _c, _d;
        var _this = this;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    tags = {};
                    _b = (_a = Promise).all;
                    _d = (_c = IterableOps).map;
                    return [4 /*yield*/, options.tags];
                case 1: return [4 /*yield*/, _b.apply(_a, [_d.apply(_c, [_e.sent(), function (tag_val) { return __awaiter(_this, void 0, void 0, function () {
                                var _a, _, tag, data;
                                return __generator(this, function (_b) {
                                    switch (_b.label) {
                                        case 0: return [4 /*yield*/, tag_val];
                                        case 1:
                                            _a = __read.apply(void 0, [(_b.sent()).match(/(^[^=]+?)=(.*)/), 3]), _ = _a[0], tag = _a[1], data = _a[2];
                                            if (!tags[tag]) {
                                                tags[tag] = [];
                                            }
                                            tags[tag].push(data);
                                            return [2 /*return*/];
                                    }
                                });
                            }); }])])];
                case 2:
                    _e.sent();
                    return [2 /*return*/, tags];
            }
        });
    });
}
exports.extractUnencryptedTags = extractUnencryptedTags;
function extractTags(options) {
    return __awaiter(this, void 0, void 0, function () {
        var tags, _a, _b, _c, _d;
        var _this = this;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    tags = {};
                    _b = (_a = Promise).all;
                    _d = (_c = IterableOps).map;
                    return [4 /*yield*/, options.tags];
                case 1: return [4 /*yield*/, _b.apply(_a, [_d.apply(_c, [_e.sent(), function (tag_val) { return __awaiter(_this, void 0, void 0, function () {
                                var _a, _, tag, data, _b, _c, _d, _e, _f, _g, _h;
                                return __generator(this, function (_j) {
                                    switch (_j.label) {
                                        case 0: return [4 /*yield*/, tag_val];
                                        case 1:
                                            _a = __read.apply(void 0, [(_j.sent()).match(/(^[^=]+?)=(.*)/), 3]), _ = _a[0], tag = _a[1], data = _a[2];
                                            if (!tags[tag]) {
                                                tags[tag] = [];
                                            }
                                            if (!options.decrypt.has(tag)) return [3 /*break*/, 3];
                                            _c = (_b = tags[tag]).push;
                                            _e = (_d = String.fromCharCode).apply;
                                            _f = [String];
                                            _g = [[]];
                                            _h = Uint8Array.bind;
                                            return [4 /*yield*/, decryptTagRaw({
                                                    key: options.key,
                                                    data: data
                                                })];
                                        case 2:
                                            _c.apply(_b, [_e.apply(_d, _f.concat([__spreadArray.apply(void 0, _g.concat([__read.apply(void 0, [new (_h.apply(Uint8Array, [void 0, (_j.sent()).data]))()])]))]))]);
                                            return [3 /*break*/, 4];
                                        case 3:
                                            tags[tag].push(data);
                                            _j.label = 4;
                                        case 4: return [2 /*return*/];
                                    }
                                });
                            }); }])])];
                case 2:
                    _e.sent();
                    return [2 /*return*/, tags];
            }
        });
    });
}
exports.extractTags = extractTags;
function encryptPreKey(_a) {
    var prekey = _a.prekey, pw = _a.pw, hashAlgorithm = _a.hashAlgorithm, iterations = _a.iterations;
    return __awaiter(this, void 0, void 0, function () {
        var nonce, key, data;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    nonce = crypto.getRandomValues(new Uint8Array(13));
                    return [4 /*yield*/, derivePW({ pw: pw, salt: nonce, hashAlgorithm: hashAlgorithm, iterations: iterations })];
                case 1:
                    key = (_b.sent())
                        .data;
                    return [4 /*yield*/, encryptAESGCM({
                            nonce: nonce,
                            key: key,
                            data: prekey
                        })];
                case 2:
                    data = (_b.sent()).data;
                    return [2 /*return*/, "" + Buffer.from(nonce).toString('base64') + Buffer.from(data).toString('base64')];
            }
        });
    });
}
exports.encryptPreKey = encryptPreKey;
function _pwsdecryptprekey(options) {
    return __awaiter(this, void 0, void 0, function () {
        var prefix, prekey, _prekey, nonce, realkey, decryptprocesses, _a, _b, pw, _c, _d, _e, e_3_1;
        var e_3, _f, _g;
        return __generator(this, function (_h) {
            switch (_h.label) {
                case 0:
                    prefix = null;
                    if (typeof options.prekey === 'string') {
                        _prekey = options.prekey.split(':', 1);
                        if (_prekey.length > 1) {
                            prefix = _prekey[0];
                            prekey = Buffer.from(_prekey[1], 'base64').buffer;
                        }
                        else {
                            prekey = Buffer.from(_prekey[0], 'base64').buffer;
                        }
                    }
                    else {
                        prekey = options.prekey;
                    }
                    nonce = new Uint8Array(prekey.slice(0, 13));
                    realkey = prekey.slice(13);
                    decryptprocesses = [];
                    _h.label = 1;
                case 1:
                    _h.trys.push([1, 6, 7, 8]);
                    _a = __values(options.pws), _b = _a.next();
                    _h.label = 2;
                case 2:
                    if (!!_b.done) return [3 /*break*/, 5];
                    pw = _b.value;
                    _d = (_c = decryptprocesses).push;
                    _e = decryptAESGCM;
                    _g = {
                        data: realkey
                    };
                    return [4 /*yield*/, derivePW({
                            pw: pw,
                            salt: nonce,
                            hashAlgorithm: options.hashAlgorithm,
                            iterations: options.iterations
                        })];
                case 3:
                    _d.apply(_c, [_e.apply(void 0, [(_g.key = (_h.sent()).data,
                                _g.nonce = nonce,
                                _g)])]);
                    _h.label = 4;
                case 4:
                    _b = _a.next();
                    return [3 /*break*/, 2];
                case 5: return [3 /*break*/, 8];
                case 6:
                    e_3_1 = _h.sent();
                    e_3 = { error: e_3_1 };
                    return [3 /*break*/, 8];
                case 7:
                    try {
                        if (_b && !_b.done && (_f = _a["return"])) _f.call(_a);
                    }
                    finally { if (e_3) throw e_3.error; }
                    return [7 /*endfinally*/];
                case 8: return [4 /*yield*/, Promise.any(decryptprocesses).then(function (obj) { return obj.data; })];
                case 9: return [2 /*return*/, [_h.sent(), prefix]];
            }
        });
    });
}
function decryptPreKeys(options) {
    return __awaiter(this, void 0, void 0, function () {
        var decryptprocesses, _a, _b, prekey, results, _c, _d, res, e_4_1;
        var e_5, _e, e_4, _f;
        return __generator(this, function (_g) {
            switch (_g.label) {
                case 0:
                    decryptprocesses = [];
                    try {
                        for (_a = __values(options.prekeys), _b = _a.next(); !_b.done; _b = _a.next()) {
                            prekey = _b.value;
                            decryptprocesses.push(_pwsdecryptprekey(__assign(__assign({}, options), { prekey: prekey })));
                        }
                    }
                    catch (e_5_1) { e_5 = { error: e_5_1 }; }
                    finally {
                        try {
                            if (_b && !_b.done && (_e = _a["return"])) _e.call(_a);
                        }
                        finally { if (e_5) throw e_5.error; }
                    }
                    results = [];
                    _g.label = 1;
                case 1:
                    _g.trys.push([1, 6, 7, 8]);
                    return [4 /*yield*/, Promise.allSettled(decryptprocesses)];
                case 2:
                    _c = __values.apply(void 0, [_g.sent()]), _d = _c.next();
                    _g.label = 3;
                case 3:
                    if (!!_d.done) return [3 /*break*/, 5];
                    res = _d.value;
                    if (res['value']) {
                        results.push(res
                            .value);
                    }
                    _g.label = 4;
                case 4:
                    _d = _c.next();
                    return [3 /*break*/, 3];
                case 5: return [3 /*break*/, 8];
                case 6:
                    e_4_1 = _g.sent();
                    e_4 = { error: e_4_1 };
                    return [3 /*break*/, 8];
                case 7:
                    try {
                        if (_d && !_d.done && (_f = _c["return"])) _f.call(_c);
                    }
                    finally { if (e_4) throw e_4.error; }
                    return [7 /*endfinally*/];
                case 8: return [2 /*return*/, results];
            }
        });
    });
}
exports.decryptPreKeys = decryptPreKeys;
function decryptFirstPreKey(options) {
    return __awaiter(this, void 0, void 0, function () {
        var decryptprocesses, _a, _b, prekey;
        var e_6, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    decryptprocesses = [];
                    try {
                        for (_a = __values(options.prekeys), _b = _a.next(); !_b.done; _b = _a.next()) {
                            prekey = _b.value;
                            if (options.fn) {
                                decryptprocesses.push(_pwsdecryptprekey(__assign(__assign({}, options), { prekey: prekey })).then(options.fn));
                            }
                            else {
                                decryptprocesses.push(_pwsdecryptprekey(__assign(__assign({}, options), { prekey: prekey })));
                            }
                        }
                    }
                    catch (e_6_1) { e_6 = { error: e_6_1 }; }
                    finally {
                        try {
                            if (_b && !_b.done && (_c = _a["return"])) _c.call(_a);
                        }
                        finally { if (e_6) throw e_6.error; }
                    }
                    return [4 /*yield*/, Promise.any(decryptprocesses)];
                case 1: return [2 /*return*/, _d.sent()];
            }
        });
    });
}
exports.decryptFirstPreKey = decryptFirstPreKey;
//# sourceMappingURL=encryption.js.map