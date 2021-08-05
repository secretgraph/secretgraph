"use strict";
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
exports.__esModule = true;
exports.extractPubKeysReferences = exports.extractPubKeysCluster = exports.encryptSharedKey = exports.createSignatureReferences = exports.createClient = void 0;
var client_1 = require("@apollo/client");
var apollo_upload_client_1 = require("apollo-upload-client");
var constants_1 = require("../constants");
var encryption_1 = require("./encryption");
var createClient = function (url) {
    return new client_1.ApolloClient({
        cache: new client_1.InMemoryCache({
            typePolicies: {
                ActionEntry: {
                    merge: false
                },
                SecretgraphObject: {
                    queryType: true,
                    fields: {
                    // is dangerous
                    // all filters must be specified, otherwise errors
                    /**
                     * problem: logout
                     * clusters: relayStylePagination([
                        'includeTags',
                        'excludeTags',
                        'contentHashes',
                        'user',
                        'public',
                        'featured',
                        'deleted',
                        'minUpdated',
                        'maxUpdated',
                    ]),
                    contents: relayStylePagination([
                        'includeTags',
                        'excludeTags',
                        'contentHashes',
                        'public',
                        'deleted',
                        'minUpdated',
                        'maxUpdated',
                    ]),*/
                    }
                }
            }
        }),
        link: apollo_upload_client_1.createUploadLink({
            uri: url
        }),
        name: 'secretgraph',
        version: '0.1',
        queryDeduplication: false,
        defaultOptions: {
            watchQuery: {
                fetchPolicy: 'cache-and-network'
            }
        }
    });
};
exports.createClient = createClient;
function createSignatureReferences_helper(key, hashalgo, content) {
    return __awaiter(this, void 0, void 0, function () {
        var _x, signkey, hash, hashalgo2, hashalgo2_len, _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
        var _m;
        return __generator(this, function (_o) {
            switch (_o.label) {
                case 0: return [4 /*yield*/, key];
                case 1:
                    _x = _o.sent();
                    hashalgo2 = constants_1.mapHashNames[hashalgo].operationName;
                    hashalgo2_len = constants_1.mapHashNames[hashalgo].length;
                    if (!_x['hash']) return [3 /*break*/, 2];
                    signkey = _x.key;
                    hash = _x.hash;
                    return [3 /*break*/, 5];
                case 2:
                    signkey = key;
                    _a = encryption_1.serializeToBase64;
                    _c = (_b = crypto.subtle).digest;
                    _d = [hashalgo2];
                    _f = (_e = crypto.subtle).exportKey;
                    _g = ['spki'];
                    return [4 /*yield*/, encryption_1.unserializeToCryptoKey(key, {
                            name: 'RSA-OAEP',
                            hash: hashalgo2
                        }, 'publicKey')];
                case 3: return [4 /*yield*/, _f.apply(_e, _g.concat([_o.sent()]))];
                case 4:
                    hash = _a.apply(void 0, [_c.apply(_b, _d.concat([_o.sent()]))]);
                    _o.label = 5;
                case 5:
                    _m = {};
                    _h = encryption_1.serializeToBase64;
                    _k = (_j = crypto.subtle).sign;
                    _l = [{
                            name: 'RSA-PSS',
                            saltLength: hashalgo2_len / 8
                        }];
                    return [4 /*yield*/, encryption_1.unserializeToCryptoKey(signkey, {
                            name: 'RSA-PSS',
                            hash: hashalgo2
                        }, 'privateKey')];
                case 6:
                    _l = _l.concat([_o.sent()]);
                    return [4 /*yield*/, content];
                case 7: return [4 /*yield*/, _h.apply(void 0, [_k.apply(_j, _l.concat([_o.sent()]))])];
                case 8:
                    _m.signature = _o.sent();
                    return [4 /*yield*/, hash];
                case 9: return [2 /*return*/, (_m.hash = _o.sent(),
                        _m)];
            }
        });
    });
}
function createSignatureReferences(content, privkeys, hashalgo) {
    var e_1, _a;
    var references = [];
    var hashValue = constants_1.mapHashNames[hashalgo];
    if (!hashValue) {
        throw Error('hashalgorithm not supported: ' + hashalgo);
    }
    try {
        for (var privkeys_1 = __values(privkeys), privkeys_1_1 = privkeys_1.next(); !privkeys_1_1.done; privkeys_1_1 = privkeys_1.next()) {
            var privKey = privkeys_1_1.value;
            references.push(createSignatureReferences_helper(privKey, hashalgo, encryption_1.unserializeToArrayBuffer(content)).then(function (_a) {
                var signature = _a.signature, hash = _a.hash;
                return {
                    target: hash,
                    group: 'signature',
                    extra: hashValue.serializedName + ":" + signature,
                    deleteRecursive: 'FALSE'
                };
            }));
        }
    }
    catch (e_1_1) { e_1 = { error: e_1_1 }; }
    finally {
        try {
            if (privkeys_1_1 && !privkeys_1_1.done && (_a = privkeys_1["return"])) _a.call(privkeys_1);
        }
        finally { if (e_1) throw e_1.error; }
    }
    return Promise.all(references);
}
exports.createSignatureReferences = createSignatureReferences;
function encryptSharedKey_helper(key, hashalgo, sharedkey) {
    return __awaiter(this, void 0, void 0, function () {
        var _x, pubkey, hash, operationName, _a, _b, _c, _d, _e, _f, _g;
        var _h;
        return __generator(this, function (_j) {
            switch (_j.label) {
                case 0: return [4 /*yield*/, key];
                case 1:
                    _x = _j.sent();
                    if (!_x['hash']) return [3 /*break*/, 2];
                    pubkey = _x.key;
                    hash = _x.hash;
                    return [3 /*break*/, 5];
                case 2:
                    operationName = constants_1.mapHashNames['' + hashalgo].operationName;
                    if (!operationName) {
                        throw new Error('Invalid hash algorithm/no hash algorithm specified and no CryptoHashPair provided: ' +
                            hashalgo);
                    }
                    pubkey = encryption_1.unserializeToCryptoKey(key, {
                        name: 'RSA-OAEP',
                        hash: operationName
                    }, 'publicKey');
                    _a = encryption_1.serializeToBase64;
                    _c = (_b = crypto.subtle).digest;
                    _d = [operationName];
                    _f = (_e = crypto.subtle).exportKey;
                    _g = ['spki'];
                    return [4 /*yield*/, pubkey];
                case 3: return [4 /*yield*/, _f.apply(_e, _g.concat([_j.sent()]))];
                case 4:
                    hash = _a.apply(void 0, [_c.apply(_b, _d.concat([_j.sent()]))]);
                    _j.label = 5;
                case 5:
                    _h = {};
                    return [4 /*yield*/, encryption_1.encryptRSAOEAP({
                            key: pubkey,
                            data: sharedkey,
                            hashAlgorithm: hashalgo
                        }).then(function (data) { return encryption_1.serializeToBase64(data.data); })];
                case 6:
                    _h.encrypted = _j.sent();
                    return [4 /*yield*/, hash];
                case 7: return [2 /*return*/, (_h.hash = _j.sent(),
                        _h)];
            }
        });
    });
}
function encryptSharedKey(sharedkey, pubkeys, hashalgo) {
    var e_2, _a;
    var references = [];
    var tags = [];
    var hashValue = constants_1.mapHashNames['' + hashalgo];
    if (!hashValue) {
        throw Error('hashalgorithm not supported: ' + hashalgo);
    }
    try {
        for (var pubkeys_1 = __values(pubkeys), pubkeys_1_1 = pubkeys_1.next(); !pubkeys_1_1.done; pubkeys_1_1 = pubkeys_1.next()) {
            var pubkey = pubkeys_1_1.value;
            var temp = encryptSharedKey_helper(pubkey, hashalgo, sharedkey);
            references.push(temp.then(function (_a) {
                var encrypted = _a.encrypted, hash = _a.hash;
                return {
                    target: hash,
                    group: 'key',
                    extra: hashValue.serializedName + ":" + encrypted,
                    deleteRecursive: 'NO_GROUP'
                };
            }));
            tags.push(temp.then(function (_a) {
                var hash = _a.hash;
                return "key_hash=" + hash;
            }));
        }
    }
    catch (e_2_1) { e_2 = { error: e_2_1 }; }
    finally {
        try {
            if (pubkeys_1_1 && !pubkeys_1_1.done && (_a = pubkeys_1["return"])) _a.call(pubkeys_1);
        }
        finally { if (e_2) throw e_2.error; }
    }
    return [Promise.all(references), Promise.all(tags)];
}
exports.encryptSharedKey = encryptSharedKey;
// onlyPubkeys skips checks which can fail in case of missing tag inclusion
// this is the case with the findConfigQuery
function extractPubKeysCluster(props) {
    var e_3, _a;
    var pubkeys = props.old || {};
    var contents = props.node.cluster
        ? props.node.cluster.contents.edges
        : props.node.contents.edges;
    try {
        for (var contents_1 = __values(contents), contents_1_1 = contents_1.next(); !contents_1_1.done; contents_1_1 = contents_1.next()) {
            var keyNode = contents_1_1.value.node;
            if (!props.onlyPubkeys && !keyNode.tags.includes('type=PublicKey')) {
                continue;
            }
            if (!pubkeys[keyNode.contentHash]) {
                pubkeys[keyNode.contentHash] = fetch(keyNode.link, {
                    headers: {
                        Authorization: props.authorization.join(',')
                    }
                }).then(function (result) {
                    return encryption_1.unserializeToCryptoKey(result.arrayBuffer(), props.params, 'publicKey');
                });
            }
        }
    }
    catch (e_3_1) { e_3 = { error: e_3_1 }; }
    finally {
        try {
            if (contents_1_1 && !contents_1_1.done && (_a = contents_1["return"])) _a.call(contents_1);
        }
        finally { if (e_3) throw e_3.error; }
    }
    return pubkeys;
}
exports.extractPubKeysCluster = extractPubKeysCluster;
function extractPubKeysReferences(props) {
    var e_4, _a;
    var pubkeys = props.old || {};
    try {
        for (var _b = __values(props.node.references.edges), _c = _b.next(); !_c.done; _c = _b.next()) {
            var keyNode = _c.value.node.target;
            if (!props.onlyPubkeys && !keyNode.tags.includes('type=PublicKey')) {
                continue;
            }
            if (!pubkeys[keyNode.contentHash]) {
                pubkeys[keyNode.contentHash] = fetch(keyNode.link, {
                    headers: {
                        Authorization: props.authorization.join(',')
                    }
                }).then(function (result) {
                    return encryption_1.unserializeToCryptoKey(result.arrayBuffer(), props.params, 'publicKey');
                });
            }
        }
    }
    catch (e_4_1) { e_4 = { error: e_4_1 }; }
    finally {
        try {
            if (_c && !_c.done && (_a = _b["return"])) _a.call(_b);
        }
        finally { if (e_4) throw e_4.error; }
    }
    return pubkeys;
}
exports.extractPubKeysReferences = extractPubKeysReferences;
//# sourceMappingURL=graphql.js.map