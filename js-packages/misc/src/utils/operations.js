"use strict";
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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
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
exports.updateConfigRemoteReducer = exports.decryptContentObject = exports.initializeCluster = exports.updateCluster = exports.createCluster = exports.updateKey = exports.updateContent = exports.createKeys = exports.createContent = exports.resetDeletionNodes = exports.deleteNodes = void 0;
var constants_1 = require("../constants");
var cluster_1 = require("../queries/cluster");
var content_1 = require("../queries/content");
var node_1 = require("../queries/node");
var config_1 = require("./config");
var encryption_1 = require("./encryption");
var graphql_1 = require("./graphql");
var misc_1 = require("./misc");
function deleteNodes(_a) {
    var ids = _a.ids, client = _a.client, authorization = _a.authorization;
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, client.mutate({
                        mutation: node_1.deleteNodes,
                        variables: {
                            ids: ids,
                            authorization: authorization
                        }
                    })];
                case 1: return [2 /*return*/, _b.sent()];
            }
        });
    });
}
exports.deleteNodes = deleteNodes;
function resetDeletionNodes(_a) {
    var ids = _a.ids, client = _a.client, authorization = _a.authorization;
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, client.mutate({
                        mutation: node_1.resetDeletionNodes,
                        variables: {
                            ids: ids,
                            authorization: authorization
                        }
                    })];
                case 1: return [2 /*return*/, _b.sent()];
            }
        });
    });
}
exports.resetDeletionNodes = resetDeletionNodes;
function createContent(_a) {
    var client = _a.client, cluster = _a.cluster, tagsIntern = _a.tags, value = _a.value, options = __rest(_a, ["client", "cluster", "tags", "value"]);
    return __awaiter(this, void 0, void 0, function () {
        var nonce, key, tagsOptions, isPublic, encryptedContentPromise, halgo, _b, publicKeyReferencesPromise, tagsPromise, signatureReferencesPromise, encrypt, tags, _c, _d, _e, _f, _g, _h, _j;
        var _k, _l;
        return __generator(this, function (_m) {
            switch (_m.label) {
                case 0:
                    if (options.pubkeys.length == 0) {
                        throw Error('No public keys provided');
                    }
                    nonce = crypto.getRandomValues(new Uint8Array(13));
                    key = crypto.getRandomValues(new Uint8Array(32));
                    return [4 /*yield*/, Promise.all(tagsIntern)];
                case 1:
                    tagsOptions = _m.sent();
                    isPublic = tagsOptions.includes('state=public');
                    encryptedContentPromise = isPublic
                        ? encryption_1.unserializeToArrayBuffer(value).then(function (data) { return ({
                            data: data
                        }); })
                        : encryption_1.encryptAESGCM({
                            key: key,
                            nonce: nonce,
                            data: value
                        });
                    halgo = constants_1.mapHashNames[options.hashAlgorithm].operationName;
                    _b = __read(isPublic
                        ? [[], []]
                        : graphql_1.encryptSharedKey(key, options.pubkeys, halgo), 2), publicKeyReferencesPromise = _b[0], tagsPromise = _b[1];
                    signatureReferencesPromise = encryptedContentPromise.then(function (data) {
                        return graphql_1.createSignatureReferences(data.data, options.privkeys ? options.privkeys : [], halgo);
                    });
                    encrypt = new Set(options.encryptTags);
                    _d = (_c = Promise).all;
                    return [4 /*yield*/, tagsPromise];
                case 2: return [4 /*yield*/, _d.apply(_c, [(_m.sent())
                            .concat(tagsOptions)
                            .map(function (data) { return encryption_1.encryptTag({ data: data, key: key, encrypt: encrypt }); })])];
                case 3:
                    tags = _m.sent();
                    _f = (_e = client).mutate;
                    _k = {
                        mutation: content_1.createContentMutation,
                        // we need a current updateId
                        awaitRefetchQueries: true
                    };
                    _l = {
                        cluster: cluster
                    };
                    _h = (_g = []).concat;
                    return [4 /*yield*/, publicKeyReferencesPromise];
                case 4:
                    _j = [_m.sent()];
                    return [4 /*yield*/, signatureReferencesPromise];
                case 5:
                    _l.references = _h.apply(_g, _j.concat([_m.sent(), options.references ? __spreadArray([], __read(options.references)) : []])),
                        _l.tags = tags;
                    return [4 /*yield*/, encryption_1.serializeToBase64(nonce)];
                case 6:
                    _l.nonce = _m.sent();
                    return [4 /*yield*/, encryptedContentPromise.then(function (data) { return new Blob([data.data]); })];
                case 7: return [4 /*yield*/, _f.apply(_e, [(_k.variables = (_l.value = _m.sent(),
                            _l.actions = options.actions ? __spreadArray([], __read(options.actions)) : null,
                            _l.contentHash = options.contentHash ? options.contentHash : null,
                            _l.authorization = options.authorization,
                            _l),
                            _k)])];
                case 8: return [2 /*return*/, _m.sent()];
            }
        });
    });
}
exports.createContent = createContent;
function createKeys(_a) {
    var client = _a.client, cluster = _a.cluster, privateKey = _a.privateKey, pubkeys = _a.pubkeys, options = __rest(_a, ["client", "cluster", "privateKey", "pubkeys"]);
    return __awaiter(this, void 0, void 0, function () {
        var nonce, key, halgo, keyParams, publicKey, encryptedPrivateKeyPromise, _b, _c, specialRef, references, privateTags, signatureReferencesPromise, _d, _e, _f, _g, publicTags, _h, _j, _k, _l, _m, _o;
        var _p, _q;
        return __generator(this, function (_r) {
            switch (_r.label) {
                case 0:
                    nonce = crypto.getRandomValues(new Uint8Array(13));
                    key = crypto.getRandomValues(new Uint8Array(32));
                    halgo = constants_1.mapHashNames[options.hashAlgorithm];
                    keyParams = {
                        name: 'RSA-PSS',
                        hash: halgo.operationName
                    };
                    return [4 /*yield*/, encryption_1.unserializeToCryptoKey(options.publicKey, keyParams, 'publicKey')];
                case 1:
                    publicKey = _r.sent();
                    encryptedPrivateKeyPromise = privateKey
                        ? encryption_1.encryptAESGCM({
                            key: key,
                            nonce: nonce,
                            data: encryption_1.unserializeToCryptoKey(privateKey, keyParams, 'privateKey')
                        }).then(function (data) { return new Blob([data.data]); })
                        : null;
                    if (!pubkeys) {
                        pubkeys = [];
                    }
                    return [4 /*yield*/, Promise.all(graphql_1.encryptSharedKey(key, [publicKey].concat(pubkeys), halgo.operationName))];
                case 2:
                    _b = __read.apply(void 0, [_r.sent(), 2]), _c = __read(_b[0]), specialRef = _c[0], references = _c.slice(1), privateTags = _b[1];
                    privateTags.push("key=" + specialRef.extra);
                    signatureReferencesPromise = graphql_1.createSignatureReferences(publicKey, options.privkeys ? options.privkeys : [], halgo.operationName);
                    if (!options.privateTags) return [3 /*break*/, 4];
                    _e = (_d = privateTags.push).apply;
                    _f = [privateTags];
                    _g = [[]];
                    return [4 /*yield*/, Promise.all(options.privateTags)];
                case 3:
                    _e.apply(_d, _f.concat([__spreadArray.apply(void 0, _g.concat([__read.apply(void 0, [(_r.sent())])]))]));
                    _r.label = 4;
                case 4:
                    if (privateTags.every(function (val) { return !val.startsWith('state='); })) {
                        privateTags.push('state=internal');
                    }
                    if (!options.publicTags) return [3 /*break*/, 6];
                    return [4 /*yield*/, Promise.all(options.publicTags)];
                case 5:
                    _h = _r.sent();
                    return [3 /*break*/, 7];
                case 6:
                    _h = [];
                    _r.label = 7;
                case 7:
                    publicTags = _h;
                    if (publicTags.every(function (val) { return !val.startsWith('state='); })) {
                        publicTags.push('state=public');
                    }
                    _k = (_j = client).mutate;
                    _p = {
                        mutation: content_1.createKeysMutation,
                        // we need a current updateId
                        awaitRefetchQueries: true
                    };
                    _q = {
                        cluster: cluster
                    };
                    _m = (_l = references).concat;
                    return [4 /*yield*/, signatureReferencesPromise];
                case 8:
                    _q.references = _m.apply(_l, [_r.sent()]),
                        _q.privateTags = privateTags,
                        _q.publicTags = publicTags;
                    return [4 /*yield*/, encryption_1.serializeToBase64(nonce)];
                case 9:
                    _q.nonce = _r.sent();
                    _o = Blob.bind;
                    return [4 /*yield*/, encryption_1.unserializeToArrayBuffer(publicKey)];
                case 10:
                    _q.publicKey = new (_o.apply(Blob, [void 0, [_r.sent()]]))();
                    return [4 /*yield*/, encryptedPrivateKeyPromise];
                case 11: return [4 /*yield*/, _k.apply(_j, [(_p.variables = (_q.privateKey = _r.sent(),
                            _q.privateActions = options.privateActions
                                ? __spreadArray([], __read(options.privateActions)) : undefined,
                            _q.publicActions = options.publicActions
                                ? __spreadArray([], __read(options.publicActions)) : undefined,
                            _q.contentHash = options.contentHash ? options.contentHash : null,
                            _q.authorization = options.authorization,
                            _q),
                            _p)])];
                case 12: return [2 /*return*/, _r.sent()];
            }
        });
    });
}
exports.createKeys = createKeys;
// TODO: fix public/private. Don't encrypt if public
function updateContent(_a) {
    var id = _a.id, updateId = _a.updateId, client = _a.client, options = __rest(_a, ["id", "updateId", "client"]);
    return __awaiter(this, void 0, void 0, function () {
        var references, tags, _b, encrypt, sharedKey, encryptedContent, nonce, _c, publicKeyReferencesPromise, tagsPromise2, signatureReferencesPromise, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p;
        var _q, _r, _s;
        var _this = this;
        return __generator(this, function (_t) {
            switch (_t.label) {
                case 0:
                    if (!options.tags) return [3 /*break*/, 2];
                    return [4 /*yield*/, Promise.all(options.tags)];
                case 1:
                    _b = _t.sent();
                    return [3 /*break*/, 3];
                case 2:
                    _b = options.value
                        ? []
                        : null;
                    _t.label = 3;
                case 3:
                    tags = _b;
                    encrypt = options.encryptTags
                        ? new Set(options.encryptTags)
                        : undefined;
                    if (!options.value) return [3 /*break*/, 4];
                    sharedKey = crypto.getRandomValues(new Uint8Array(32));
                    return [3 /*break*/, 7];
                case 4:
                    if (!(options.tags && encrypt && encrypt.size > 0)) return [3 /*break*/, 6];
                    if (!options.oldKey) {
                        throw Error('Tag only update without oldKey');
                    }
                    return [4 /*yield*/, encryption_1.unserializeToArrayBuffer(options.oldKey)];
                case 5:
                    sharedKey = _t.sent();
                    return [3 /*break*/, 7];
                case 6:
                    sharedKey = undefined;
                    _t.label = 7;
                case 7:
                    encryptedContent = null;
                    nonce = undefined;
                    if (!options.value) return [3 /*break*/, 12];
                    nonce = crypto.getRandomValues(new Uint8Array(13));
                    if (!options.hashAlgorithm) {
                        throw Error('hashAlgorithm required for value updates');
                    }
                    if (options.pubkeys.length == 0) {
                        throw Error('No public keys provided');
                    }
                    return [4 /*yield*/, encryption_1.encryptAESGCM({
                            key: sharedKey,
                            nonce: nonce,
                            data: options.value
                        })];
                case 8:
                    encryptedContent = _t.sent();
                    _c = __read(graphql_1.encryptSharedKey(sharedKey, options.pubkeys, options.hashAlgorithm), 2), publicKeyReferencesPromise = _c[0], tagsPromise2 = _c[1];
                    signatureReferencesPromise = graphql_1.createSignatureReferences(encryptedContent.data, options.privkeys ? options.privkeys : [], options.hashAlgorithm);
                    _e = (_d = []).concat;
                    return [4 /*yield*/, publicKeyReferencesPromise];
                case 9:
                    _f = [_t.sent()];
                    return [4 /*yield*/, signatureReferencesPromise];
                case 10:
                    references = _e.apply(_d, _f.concat([_t.sent(), options.references ? __spreadArray([], __read(options.references)) : []]));
                    _h = (_g = (_q = tags).push).apply;
                    _j = [_q];
                    _k = [[]];
                    return [4 /*yield*/, tagsPromise2];
                case 11:
                    _h.apply(_g, _j.concat([__spreadArray.apply(void 0, _k.concat([__read.apply(void 0, [(_t.sent())])]))]));
                    return [3 /*break*/, 13];
                case 12:
                    references = options.references ? options.references : null;
                    _t.label = 13;
                case 13:
                    _m = (_l = client).mutate;
                    _r = {
                        mutation: content_1.updateContentMutation,
                        // we need a current updateId
                        awaitRefetchQueries: true
                    };
                    _s = {
                        id: id,
                        updateId: updateId,
                        cluster: options.cluster ? options.cluster : null,
                        references: references
                    };
                    if (!tags) return [3 /*break*/, 15];
                    return [4 /*yield*/, Promise.all(tags.map(function (tagPromise) { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, encryption_1.encryptTag({
                                            key: sharedKey,
                                            data: tagPromise,
                                            encrypt: encrypt
                                        })];
                                    case 1: return [2 /*return*/, _a.sent()];
                                }
                            });
                        }); }))];
                case 14:
                    _o = _t.sent();
                    return [3 /*break*/, 16];
                case 15:
                    _o = null;
                    _t.label = 16;
                case 16:
                    _s.tags = _o;
                    if (!nonce) return [3 /*break*/, 18];
                    return [4 /*yield*/, encryption_1.serializeToBase64(nonce)];
                case 17:
                    _p = _t.sent();
                    return [3 /*break*/, 19];
                case 18:
                    _p = undefined;
                    _t.label = 19;
                case 19: return [4 /*yield*/, _m.apply(_l, [(_r.variables = (_s.nonce = _p,
                            _s.value = encryptedContent ? new Blob([encryptedContent.data]) : null,
                            _s.actions = options.actions ? __spreadArray([], __read(options.actions)) : null,
                            _s.contentHash = options.contentHash ? options.contentHash : null,
                            _s.authorization = __spreadArray([], __read(options.authorization)),
                            _s),
                            _r)])];
                case 20: return [2 /*return*/, _t.sent()];
            }
        });
    });
}
exports.updateContent = updateContent;
function updateKey(_a) {
    var id = _a.id, updateId = _a.updateId, client = _a.client, options = __rest(_a, ["id", "updateId", "client"]);
    return __awaiter(this, void 0, void 0, function () {
        var references, updatedKey, tags, _b, encrypt, sharedKey, completedKey, nonce, _c, _d, specialRef, publicKeyReferences, privateTags, signatureReferencesPromise, _e, _f, _g, _h;
        var _j, _k, _l, _m;
        var _this = this;
        return __generator(this, function (_o) {
            switch (_o.label) {
                case 0: return [4 /*yield*/, options.key];
                case 1:
                    updatedKey = _o.sent();
                    if (!options.tags) return [3 /*break*/, 3];
                    return [4 /*yield*/, Promise.all(options.tags)];
                case 2:
                    _b = _o.sent();
                    return [3 /*break*/, 4];
                case 3:
                    _b = updatedKey
                        ? []
                        : null;
                    _o.label = 4;
                case 4:
                    tags = _b;
                    encrypt = options.encryptTags
                        ? new Set(options.encryptTags)
                        : undefined;
                    if (!(updatedKey && updatedKey.type == 'private')) return [3 /*break*/, 5];
                    sharedKey = crypto.getRandomValues(new Uint8Array(32));
                    return [3 /*break*/, 8];
                case 5:
                    if (!(options.tags && encrypt && encrypt.size > 0)) return [3 /*break*/, 7];
                    if (!options.oldKey) {
                        throw Error('Tag only update without oldKey');
                    }
                    return [4 /*yield*/, encryption_1.unserializeToArrayBuffer(options.oldKey)];
                case 6:
                    sharedKey = _o.sent();
                    return [3 /*break*/, 8];
                case 7:
                    sharedKey = undefined;
                    _o.label = 8;
                case 8:
                    completedKey = null;
                    nonce = undefined;
                    if (!(updatedKey && updatedKey.type == 'private')) return [3 /*break*/, 11];
                    nonce = crypto.getRandomValues(new Uint8Array(13));
                    if (!options.hashAlgorithm) {
                        throw Error('hashAlgorithm required for key updates');
                    }
                    if (!options.pubkeys || options.pubkeys.length == 0) {
                        throw Error('No public keys provided');
                    }
                    return [4 /*yield*/, encryption_1.encryptAESGCM({
                            key: sharedKey,
                            nonce: nonce,
                            data: updatedKey
                        })];
                case 9:
                    completedKey = _o.sent();
                    return [4 /*yield*/, Promise.all(graphql_1.encryptSharedKey(sharedKey, [updatedKey].concat(options.pubkeys), options.hashAlgorithm))];
                case 10:
                    _c = __read.apply(void 0, [_o.sent(), 2]), _d = __read(_c[0]), specialRef = _d[0], publicKeyReferences = _d.slice(1), privateTags = _c[1];
                    (_j = tags).push.apply(_j, __spreadArray(["key=" + specialRef.extra], __read(privateTags)));
                    references = publicKeyReferences.concat(options.references ? __spreadArray([], __read(options.references)) : []);
                    if (tags.every(function (val) { return !val.startsWith('state='); })) {
                        ;
                        tags.push('state=internal');
                    }
                    return [3 /*break*/, 15];
                case 11:
                    if (!(updatedKey && updatedKey.type == 'public')) return [3 /*break*/, 14];
                    if (!options.hashAlgorithm) {
                        throw Error('hashAlgorithm required for key resigning');
                    }
                    _k = {};
                    return [4 /*yield*/, encryption_1.unserializeToArrayBuffer(updatedKey)];
                case 12:
                    completedKey = (_k.data = _o.sent(), _k);
                    signatureReferencesPromise = graphql_1.createSignatureReferences(updatedKey, options.privkeys ? options.privkeys : [], options.hashAlgorithm);
                    return [4 /*yield*/, signatureReferencesPromise];
                case 13:
                    references = (_o.sent()).concat(options.references ? __spreadArray([], __read(options.references)) : []);
                    if (tags && tags.every(function (val) { return !val.startsWith('state='); })) {
                        tags.push('state=public');
                    }
                    return [3 /*break*/, 15];
                case 14:
                    references = options.references ? options.references : null;
                    _o.label = 15;
                case 15:
                    if (tags && tags.every(function (val) { return !val.startsWith('state='); })) {
                        throw Error('Missing state');
                    }
                    _f = (_e = client).mutate;
                    _l = {
                        // we need a current updateId
                        awaitRefetchQueries: true,
                        mutation: content_1.updateKeyMutation
                    };
                    _m = {
                        id: id,
                        updateId: updateId,
                        cluster: options.cluster ? options.cluster : null,
                        references: references
                    };
                    if (!tags) return [3 /*break*/, 17];
                    return [4 /*yield*/, Promise.all(tags.map(function (tagPromise) { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, encryption_1.encryptTag({
                                            key: sharedKey,
                                            data: tagPromise,
                                            encrypt: encrypt
                                        })];
                                    case 1: return [2 /*return*/, _a.sent()];
                                }
                            });
                        }); }))];
                case 16:
                    _g = _o.sent();
                    return [3 /*break*/, 18];
                case 17:
                    _g = null;
                    _o.label = 18;
                case 18:
                    _m.tags = _g;
                    if (!nonce) return [3 /*break*/, 20];
                    return [4 /*yield*/, encryption_1.serializeToBase64(nonce)];
                case 19:
                    _h = _o.sent();
                    return [3 /*break*/, 21];
                case 20:
                    _h = undefined;
                    _o.label = 21;
                case 21: return [4 /*yield*/, _f.apply(_e, [(_l.variables = (_m.nonce = _h,
                            _m.key = completedKey ? new Blob([completedKey.data]) : null,
                            _m.actions = options.actions ? __spreadArray([], __read(options.actions)) : null,
                            _m.contentHash = options.contentHash ? options.contentHash : null,
                            _m.authorization = __spreadArray([], __read(options.authorization)),
                            _m),
                            _l)])];
                case 22: return [2 /*return*/, _o.sent()];
            }
        });
    });
}
exports.updateKey = updateKey;
function createCluster(options) {
    return __awaiter(this, void 0, void 0, function () {
        var nonce, halgo, privateKeyPromise, publicKeyPromise, privateTags, _a, _b, _c, _d, _e;
        var _f, _g;
        return __generator(this, function (_h) {
            switch (_h.label) {
                case 0:
                    nonce = null;
                    halgo = constants_1.mapHashNames[options.hashAlgorithm];
                    publicKeyPromise = encryption_1.unserializeToArrayBuffer(options.publicKey).then(function (obj) { return new Blob([obj]); });
                    privateTags = ['state=internal'];
                    if (!(options.privateKey && options.privateKeyKey)) return [3 /*break*/, 2];
                    nonce = crypto.getRandomValues(new Uint8Array(13));
                    privateKeyPromise = encryption_1.encryptAESGCM({
                        key: options.privateKeyKey,
                        data: options.privateKey,
                        nonce: nonce
                    }).then(function (obj) { return new Blob([obj.data]); });
                    _b = (_a = privateTags).push;
                    return [4 /*yield*/, encryption_1.encryptRSAOEAP({
                            key: options.privateKey,
                            data: options.privateKeyKey,
                            hashAlgorithm: options.hashAlgorithm
                        })
                            .then(function (data) { return encryption_1.serializeToBase64(data.data); })
                            .then(function (obj) { return "key=" + halgo.serializedName + ":" + obj; })];
                case 1:
                    _b.apply(_a, [_h.sent()]);
                    return [3 /*break*/, 3];
                case 2:
                    privateKeyPromise = Promise.resolve(null);
                    _h.label = 3;
                case 3:
                    _d = (_c = options.client).mutate;
                    _f = {
                        mutation: cluster_1.createClusterMutation,
                        // we need a current updateId
                        awaitRefetchQueries: true
                    };
                    _g = {
                        description: options.description
                    };
                    return [4 /*yield*/, publicKeyPromise];
                case 4:
                    _g.publicKey = _h.sent();
                    return [4 /*yield*/, privateKeyPromise];
                case 5:
                    _g.privateKey = _h.sent(),
                        _g.privateTags = privateTags;
                    if (!nonce) return [3 /*break*/, 7];
                    return [4 /*yield*/, encryption_1.serializeToBase64(nonce)];
                case 6:
                    _e = _h.sent();
                    return [3 /*break*/, 8];
                case 7:
                    _e = null;
                    _h.label = 8;
                case 8: return [4 /*yield*/, _d.apply(_c, [(_f.variables = (_g.nonce = _e,
                            _g.actions = options.actions,
                            _g.authorization = options.authorization,
                            _g),
                            _f)])];
                case 9: return [2 /*return*/, _h.sent()];
            }
        });
    });
}
exports.createCluster = createCluster;
function updateCluster(options) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, options.client.mutate({
                        mutation: cluster_1.updateClusterMutation,
                        // we need a current updateId
                        awaitRefetchQueries: true,
                        variables: {
                            id: options.id,
                            updateId: options.updateId,
                            description: options.description,
                            actions: options.actions,
                            authorization: options.authorization
                        }
                    })];
                case 1: return [2 /*return*/, _a.sent()];
            }
        });
    });
}
exports.updateCluster = updateCluster;
function initializeCluster(client, config, hashAlgorithm) {
    return __awaiter(this, void 0, void 0, function () {
        var key, _a, publicKey, privateKey, digestCertificatePromise, digestActionKeyPromise, keyb64, clusterResponse, clusterResult, _b, digestActionKey, digestCertificate, _c, _d, digest, authorization;
        var _e;
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0:
                    key = crypto.getRandomValues(new Uint8Array(32));
                    return [4 /*yield*/, crypto.subtle.generateKey({
                            name: 'RSA-OAEP',
                            //modulusLength: 8192,
                            modulusLength: 2048,
                            publicExponent: new Uint8Array([1, 0, 1]),
                            hash: hashAlgorithm
                        }, true, ['wrapKey', 'unwrapKey', 'encrypt', 'decrypt'])];
                case 1:
                    _a = _f.sent(), publicKey = _a.publicKey, privateKey = _a.privateKey;
                    digestCertificatePromise = crypto.subtle
                        .exportKey('spki', publicKey)
                        .then(function (keydata) {
                        return crypto.subtle
                            .digest(hashAlgorithm, keydata)
                            .then(function (data) { return Buffer.from(data).toString('base64'); });
                    });
                    digestActionKeyPromise = crypto.subtle
                        .digest(hashAlgorithm, key)
                        .then(function (data) { return Buffer.from(data).toString('base64'); });
                    keyb64 = Buffer.from(key).toString('base64');
                    return [4 /*yield*/, createCluster({
                            client: client,
                            actions: [{ value: '{"action": "manage"}', key: keyb64 }],
                            description: '',
                            hashAlgorithm: hashAlgorithm,
                            publicKey: publicKey,
                            privateKey: privateKey,
                            privateKeyKey: key
                        })];
                case 2:
                    clusterResponse = _f.sent();
                    clusterResult = clusterResponse.data.updateOrCreateCluster;
                    return [4 /*yield*/, Promise.all([
                            digestActionKeyPromise,
                            digestCertificatePromise,
                        ])];
                case 3:
                    _b = __read.apply(void 0, [_f.sent(), 2]), digestActionKey = _b[0], digestCertificate = _b[1];
                    config.configCluster = clusterResult.cluster['id'];
                    config.hosts[config['baseUrl']].clusters[clusterResult.cluster['id']] = {
                        hashes: {}
                    };
                    config.hosts[config['baseUrl']].clusters[clusterResult.cluster['id']].hashes[digestActionKey] = ['manage'];
                    config.hosts[config['baseUrl']].clusters[clusterResult.cluster['id']].hashes[digestCertificate] = [];
                    _c = config['certificates'];
                    _d = digestCertificate;
                    _e = {};
                    return [4 /*yield*/, encryption_1.serializeToBase64(privateKey)];
                case 4:
                    _c[_d] = (_e.data = _f.sent(),
                        _e.note = 'initial certificate',
                        _e);
                    config.tokens[digestActionKey] = {
                        data: keyb64,
                        note: 'initial token'
                    };
                    if (!config_1.cleanConfig(config)) {
                        throw Error('invalid config created');
                    }
                    return [4 /*yield*/, misc_1.sortedHash(['type=Config'], hashAlgorithm)];
                case 5:
                    digest = _f.sent();
                    authorization = config_1.extractAuthInfo({
                        config: config,
                        clusters: new Set([clusterResult.cluster['id']]),
                        require: new Set(['manage']),
                        url: config.baseUrl
                    }).tokens;
                    return [4 /*yield*/, createContent({
                            client: client,
                            config: config,
                            cluster: clusterResult.cluster['id'],
                            value: new Blob([JSON.stringify(config)]),
                            pubkeys: [publicKey],
                            privkeys: [privateKey],
                            tags: ['type=Config', 'state=internal'],
                            contentHash: digest,
                            hashAlgorithm: hashAlgorithm,
                            authorization: authorization
                        }).then(function (_a) {
                            var data = _a.data;
                            return {
                                config: config,
                                cluster: clusterResult,
                                content: data.updateOrCreateContent
                            };
                        })];
                case 6: return [2 /*return*/, _f.sent()];
            }
        });
    });
}
exports.initializeCluster = initializeCluster;
function decryptContentObject(_a) {
    var _config = _a.config, nodeData = _a.nodeData, blobOrTokens = _a.blobOrTokens, baseUrl = _a.baseUrl, _b = _a.decrypt, decrypt = _b === void 0 ? new Set() : _b;
    return __awaiter(this, void 0, void 0, function () {
        var arrPromise, _info, config, _node, key, found, exc_1, _c, _d, exc_2;
        var _e, _f;
        var _this = this;
        return __generator(this, function (_g) {
            switch (_g.label) {
                case 0: return [4 /*yield*/, blobOrTokens];
                case 1:
                    _info = _g.sent();
                    return [4 /*yield*/, _config];
                case 2:
                    config = _g.sent();
                    return [4 /*yield*/, nodeData];
                case 3:
                    _node = _g.sent();
                    if (!_node) {
                        throw Error('no node found');
                    }
                    if (_info instanceof Blob) {
                        arrPromise = _info.arrayBuffer();
                    }
                    else if (typeof _info == 'string') {
                        arrPromise = Promise.resolve(misc_1.b64toarr(_info).buffer);
                    }
                    else {
                        arrPromise = fetch(new URL(_node.link, baseUrl || config.baseUrl).href, {
                            headers: {
                                Authorization: _info.join(',')
                            }
                        }).then(function (result) { return result.arrayBuffer(); });
                    }
                    if (!_node.tags.includes('type=PublicKey')) return [3 /*break*/, 5];
                    _e = {};
                    return [4 /*yield*/, arrPromise];
                case 4: return [2 /*return*/, (_e.data = _g.sent(),
                        _e.tags = nodeData.tags,
                        _e.updateId = nodeData.updateId,
                        _e.nodeData = nodeData,
                        _e)];
                case 5:
                    _g.trys.push([5, 7, , 8]);
                    found = config_1.findCertCandidatesForRefs(config, _node);
                    if (!found.length) {
                        return [2 /*return*/, null];
                    }
                    return [4 /*yield*/, Promise.any(found.map(function (value) { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, encryption_1.decryptRSAOEAP({
                                            key: config.certificates[value.hash].data,
                                            data: value.sharedKey,
                                            hashAlgorithm: value.hashAlgorithm
                                        })];
                                    case 1: return [2 /*return*/, _a.sent()];
                                }
                            });
                        }); }))];
                case 6:
                    // find key (=first result of decoding shared key)
                    key = (_g.sent()).data;
                    return [3 /*break*/, 8];
                case 7:
                    exc_1 = _g.sent();
                    console.debug('No matching certificate found', exc_1, exc_1 === null || exc_1 === void 0 ? void 0 : exc_1.errors);
                    return [2 /*return*/, null];
                case 8:
                    _g.trys.push([8, 11, , 12]);
                    _c = [{}];
                    return [4 /*yield*/, encryption_1.decryptAESGCM({
                            key: key,
                            nonce: _node.nonce,
                            data: arrPromise
                        })];
                case 9:
                    _d = [__assign.apply(void 0, _c.concat([(_g.sent())]))];
                    _f = { updateId: nodeData.updateId };
                    return [4 /*yield*/, encryption_1.extractTags({ key: key, tags: nodeData.tags, decrypt: decrypt })];
                case 10: return [2 /*return*/, __assign.apply(void 0, _d.concat([(_f.tags = _g.sent(), _f.nodeData = nodeData, _f)]))];
                case 11:
                    exc_2 = _g.sent();
                    console.debug('Decoding content failed', exc_2);
                    throw Error("Encrypted content and shared key doesn't match");
                case 12: return [2 /*return*/];
            }
        });
    });
}
exports.decryptContentObject = decryptContentObject;
function updateConfigRemoteReducer(state, _a) {
    var _b;
    var update = _a.update, authInfo = _a.authInfo, client = _a.client;
    return __awaiter(this, void 0, void 0, function () {
        var config, privkeys, pubkeys, configQueryRes, node, retrieved, foundConfig, _c, mergedConfig, changes, algos, result;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    if (update === null) {
                        // protect config update against null
                        return [2 /*return*/, null];
                    }
                    config = state || config_1.updateConfigReducer(null, { update: update });
                    if (!authInfo) {
                        authInfo = config_1.extractAuthInfo({
                            config: config,
                            url: config.baseUrl,
                            clusters: new Set([config.configCluster]),
                            require: new Set(['update', 'manage'])
                        });
                    }
                    privkeys = undefined;
                    pubkeys = undefined;
                    _d.label = 1;
                case 1:
                    if (!true) return [3 /*break*/, 5];
                    return [4 /*yield*/, client.query({
                            query: content_1.findConfigQuery,
                            variables: {
                                cluster: config.configCluster,
                                authorization: authInfo.tokens
                            },
                            // but why? should be updated by cache updates (for this no-cache is required in config content updates)
                            fetchPolicy: 'network-only'
                        })];
                case 2:
                    configQueryRes = _d.sent();
                    if (configQueryRes.errors) {
                        throw configQueryRes.errors;
                    }
                    node = (_b = configQueryRes.data.secretgraph.contents.edges[0]) === null || _b === void 0 ? void 0 : _b.node;
                    if (!node) {
                        throw Error('could not find config object');
                    }
                    return [4 /*yield*/, decryptContentObject({
                            nodeData: node,
                            config: config,
                            blobOrTokens: authInfo.tokens,
                            baseUrl: config.baseUrl
                        })];
                case 3:
                    retrieved = _d.sent();
                    if (!retrieved) {
                        throw Error('could not retrieve and decode config object');
                    }
                    foundConfig = JSON.parse(String.fromCharCode.apply(String, __spreadArray([], __read(new Uint8Array(retrieved.data)))));
                    _c = __read(config_1.updateConfig(foundConfig, update), 2), mergedConfig = _c[0], changes = _c[1];
                    if (changes == 0) {
                        return [2 /*return*/, foundConfig];
                    }
                    if (!config_1.cleanConfig(mergedConfig)) {
                        throw Error('invalid merged config');
                    }
                    algos = encryption_1.findWorkingHashAlgorithms(configQueryRes.data.secretgraph.config.hashAlgorithms);
                    privkeys = config_1.extractPrivKeys({
                        config: mergedConfig,
                        url: mergedConfig.baseUrl,
                        hashAlgorithm: algos[0],
                        old: privkeys
                    });
                    pubkeys = graphql_1.extractPubKeysReferences({
                        node: node,
                        authorization: authInfo.tokens,
                        params: {
                            name: 'RSA-OAEP',
                            hash: algos[0]
                        },
                        old: pubkeys,
                        onlyPubkeys: true
                    });
                    return [4 /*yield*/, updateContent({
                            client: client,
                            id: node.id,
                            updateId: node.updateId,
                            privkeys: Object.values(privkeys),
                            pubkeys: Object.values(pubkeys),
                            tags: ['type=Config', 'state=internal'],
                            config: mergedConfig,
                            hashAlgorithm: algos[0],
                            value: new Blob([JSON.stringify(mergedConfig)]),
                            authorization: authInfo.tokens
                        })];
                case 4:
                    result = _d.sent();
                    if (result.errors) {
                        throw new Error("Update failed: " + configQueryRes.errors);
                    }
                    if (result.data.updateOrCreateContent.writeok) {
                        return [2 /*return*/, mergedConfig];
                    }
                    return [3 /*break*/, 1];
                case 5: return [2 /*return*/];
            }
        });
    });
}
exports.updateConfigRemoteReducer = updateConfigRemoteReducer;
//# sourceMappingURL=operations.js.map