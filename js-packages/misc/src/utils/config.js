"use strict";
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
exports.updateConfigReducer = exports.updateConfig = exports.findCertCandidatesForRefs = exports.extractPrivKeys = exports.extractAuthInfo = exports.exportConfigAsUrl = exports.exportConfig = exports.saveConfig = exports.loadConfig = exports.loadConfigSync = exports.checkConfigObject = exports.cleanConfig = void 0;
var file_saver_1 = require("file-saver");
var Constants = __importStar(require("../constants"));
var content_1 = require("../queries/content");
var encryption_1 = require("./encryption");
var misc_1 = require("./misc");
var SetOps = __importStar(require("./set"));
function cleanConfig(config) {
    var e_1, _a, e_2, _b, e_3, _c;
    if (!config) {
        return null;
    }
    if (!config.baseUrl ||
        !(config.hosts instanceof Object) ||
        !(config.tokens instanceof Object) ||
        !(config.certificates instanceof Object) ||
        !config.configCluster) {
        console.error(config);
        return null;
    }
    try {
        for (var _d = __values(Object.entries(config.tokens)), _e = _d.next(); !_e.done; _e = _d.next()) {
            var _f = __read(_e.value, 2), key = _f[0], val = _f[1];
            if (typeof val == 'string') {
                config.tokens[key] = {
                    data: val,
                    note: ''
                };
            }
        }
    }
    catch (e_1_1) { e_1 = { error: e_1_1 }; }
    finally {
        try {
            if (_e && !_e.done && (_a = _d["return"])) _a.call(_d);
        }
        finally { if (e_1) throw e_1.error; }
    }
    try {
        for (var _g = __values(Object.entries(config.certificates)), _h = _g.next(); !_h.done; _h = _g.next()) {
            var _j = __read(_h.value, 2), key = _j[0], val = _j[1];
            if (typeof val == 'string') {
                config.certificates[key] = {
                    data: val,
                    note: ''
                };
            }
        }
    }
    catch (e_2_1) { e_2 = { error: e_2_1 }; }
    finally {
        try {
            if (_h && !_h.done && (_b = _g["return"])) _b.call(_g);
        }
        finally { if (e_2) throw e_2.error; }
    }
    try {
        for (var _k = __values(Object.values(config.hosts)), _l = _k.next(); !_l.done; _l = _k.next()) {
            var host = _l.value;
            if (!host['clusters']) {
                host['clusters'] = {};
            }
            if (!host['contents']) {
                host['contents'] = {};
            }
        }
    }
    catch (e_3_1) { e_3 = { error: e_3_1 }; }
    finally {
        try {
            if (_l && !_l.done && (_c = _k["return"])) _c.call(_k);
        }
        finally { if (e_3) throw e_3.error; }
    }
    return config;
}
exports.cleanConfig = cleanConfig;
function checkConfigObject(client, config) {
    return __awaiter(this, void 0, void 0, function () {
        var actions, cert, tokens, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    actions = [], cert = null;
                    if (!actions || !cert) {
                        return [2 /*return*/, false];
                    }
                    tokens = actions.map(function (action) { return config.configCluster + ":" + action; });
                    return [4 /*yield*/, client.query({
                            query: content_1.findConfigQuery,
                            variables: {
                                cluster: config.configCluster,
                                authorization: tokens
                            }
                        })];
                case 1:
                    result = _a.sent();
                    if (!result || result.data.contents.edges.length < 1) {
                        return [2 /*return*/, false];
                    }
                    if (result.data.contents.edges.length > 1) {
                        console.error('Too many config objects found', result.data.contents.edges);
                        return [2 /*return*/, false];
                    }
                    return [2 /*return*/, true];
            }
        });
    });
}
exports.checkConfigObject = checkConfigObject;
var loadConfigSync = function (obj) {
    if (obj === void 0) { obj = window.localStorage; }
    var result = obj.getItem('secretgraphConfig');
    if (!result) {
        return null;
    }
    return cleanConfig(JSON.parse(result));
};
exports.loadConfigSync = loadConfigSync;
var loadConfig = function (obj, pws) {
    if (obj === void 0) { obj = window.localStorage; }
    return __awaiter(void 0, void 0, void 0, function () {
        var parsedResult_1, _a, _b, parsedResult2, request_1, contentResult, decrypturl_1, prekeys_1, decryptResult_1, keyArr, sharedKey, config, _c, e_4;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    if (!(obj instanceof Storage)) return [3 /*break*/, 1];
                    return [2 /*return*/, exports.loadConfigSync(obj)];
                case 1:
                    if (!(obj instanceof File)) return [3 /*break*/, 5];
                    _b = (_a = JSON).parse;
                    return [4 /*yield*/, obj.text()];
                case 2:
                    parsedResult_1 = _b.apply(_a, [_d.sent()]);
                    if (!(pws && parsedResult_1.data)) return [3 /*break*/, 4];
                    return [4 /*yield*/, encryption_1.decryptFirstPreKey({
                            prekeys: parsedResult_1.prekeys,
                            pws: pws,
                            hashAlgorithm: 'SHA-512',
                            iterations: parsedResult_1.iterations,
                            fn: function (data) { return __awaiter(void 0, void 0, void 0, function () {
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0:
                                            if (data[1]) {
                                                return [2 /*return*/, Promise.reject('not for decryption')];
                                            }
                                            return [4 /*yield*/, encryption_1.decryptAESGCM({
                                                    data: parsedResult_1.data,
                                                    key: data[0],
                                                    nonce: parsedResult_1.nonce
                                                })];
                                        case 1: return [2 /*return*/, (_a.sent()).data];
                                    }
                                });
                            }); }
                        })];
                case 3:
                    parsedResult2 = (_d.sent());
                    return [2 /*return*/, cleanConfig(JSON.parse(String.fromCharCode.apply(String, __spreadArray([], __read(new Uint8Array(parsedResult2))))))];
                case 4: return [2 /*return*/, cleanConfig(parsedResult_1)];
                case 5:
                    if (obj instanceof Request) {
                        request_1 = obj;
                    }
                    else {
                        request_1 = new Request(obj);
                    }
                    return [4 /*yield*/, fetch(request_1)];
                case 6:
                    contentResult = _d.sent();
                    if (!contentResult.ok) {
                        return [2 /*return*/, null];
                    }
                    decrypturl_1 = new URL(request_1.url, window.location.href);
                    prekeys_1 = decrypturl_1.searchParams.getAll('prekey');
                    decrypturl_1.searchParams["delete"]('prekey');
                    if (!pws) return [3 /*break*/, 11];
                    decrypturl_1.searchParams.set('keys', '');
                    return [4 /*yield*/, fetch(new Request(decrypturl_1.toString(), {
                            headers: request_1.headers
                        }))];
                case 7:
                    decryptResult_1 = _d.sent();
                    decrypturl_1.searchParams["delete"]('keys');
                    if (!decryptResult_1.ok || !contentResult.headers.get('X-NONCE')) {
                        return [2 /*return*/, null];
                    }
                    return [4 /*yield*/, new Promise(function (resolve, reject) { return __awaiter(void 0, void 0, void 0, function () {
                            var queries, page, _loop_1, _a, _b, k;
                            var e_5, _c;
                            return __generator(this, function (_d) {
                                switch (_d.label) {
                                    case 0:
                                        queries = [];
                                        return [4 /*yield*/, decryptResult_1.json()];
                                    case 1:
                                        page = _d.sent();
                                        _loop_1 = function (k) {
                                            if (!k.link) {
                                                return "continue";
                                            }
                                            decrypturl_1.pathname = k.link;
                                            queries.push(fetch(new Request(decrypturl_1.toString(), {
                                                headers: request_1.headers
                                            })).then(function (response) { return __awaiter(void 0, void 0, void 0, function () {
                                                var nonce, respdata, _a, _b, iterations, e_6_1;
                                                var e_6, _c;
                                                return __generator(this, function (_d) {
                                                    switch (_d.label) {
                                                        case 0:
                                                            if (!response.ok ||
                                                                !response.headers.get('X-NONCE') ||
                                                                !response.headers.get('X-ITERATIONS')) {
                                                                return [2 /*return*/];
                                                            }
                                                            nonce = misc_1.b64toarr(response.headers.get('X-NONCE'));
                                                            return [4 /*yield*/, response.arrayBuffer()];
                                                        case 1:
                                                            respdata = _d.sent();
                                                            _d.label = 2;
                                                        case 2:
                                                            _d.trys.push([2, 9, 10, 11]);
                                                            _a = __values(response.headers.get('X-ITERATIONS').split(',')), _b = _a.next();
                                                            _d.label = 3;
                                                        case 3:
                                                            if (!!_b.done) return [3 /*break*/, 8];
                                                            iterations = _b.value;
                                                            _d.label = 4;
                                                        case 4:
                                                            _d.trys.push([4, , 6, 7]);
                                                            return [4 /*yield*/, encryption_1.decryptFirstPreKey({
                                                                    prekeys: prekeys_1,
                                                                    pws: pws,
                                                                    hashAlgorithm: 'SHA-512',
                                                                    iterations: iterations,
                                                                    fn: function (data) { return __awaiter(void 0, void 0, void 0, function () {
                                                                        return __generator(this, function (_a) {
                                                                            switch (_a.label) {
                                                                                case 0:
                                                                                    if (data[1]) {
                                                                                        return [2 /*return*/, Promise.reject('not for decryption')];
                                                                                    }
                                                                                    return [4 /*yield*/, encryption_1.decryptAESGCM({
                                                                                            key: data[0],
                                                                                            nonce: nonce,
                                                                                            data: respdata
                                                                                        }).then(function (data) {
                                                                                            return resolve([
                                                                                                data.key,
                                                                                                nonce,
                                                                                                k.extra,
                                                                                            ]);
                                                                                        })];
                                                                                case 1: return [2 /*return*/, _a.sent()];
                                                                            }
                                                                        });
                                                                    }); }
                                                                })];
                                                        case 5: return [2 /*return*/, _d.sent()];
                                                        case 6: return [7 /*endfinally*/];
                                                        case 7:
                                                            _b = _a.next();
                                                            return [3 /*break*/, 3];
                                                        case 8: return [3 /*break*/, 11];
                                                        case 9:
                                                            e_6_1 = _d.sent();
                                                            e_6 = { error: e_6_1 };
                                                            return [3 /*break*/, 11];
                                                        case 10:
                                                            try {
                                                                if (_b && !_b.done && (_c = _a["return"])) _c.call(_a);
                                                            }
                                                            finally { if (e_6) throw e_6.error; }
                                                            return [7 /*endfinally*/];
                                                        case 11: return [2 /*return*/];
                                                    }
                                                });
                                            }); }));
                                        };
                                        try {
                                            for (_a = __values(page.keys), _b = _a.next(); !_b.done; _b = _a.next()) {
                                                k = _b.value;
                                                _loop_1(k);
                                            }
                                        }
                                        catch (e_5_1) { e_5 = { error: e_5_1 }; }
                                        finally {
                                            try {
                                                if (_b && !_b.done && (_c = _a["return"])) _c.call(_a);
                                            }
                                            finally { if (e_5) throw e_5.error; }
                                        }
                                        return [4 /*yield*/, Promise.allSettled(queries)];
                                    case 2:
                                        _d.sent();
                                        reject();
                                        return [2 /*return*/];
                                }
                            });
                        }); })];
                case 8:
                    keyArr = _d.sent();
                    return [4 /*yield*/, encryption_1.decryptAESGCM({
                            key: keyArr[0],
                            nonce: keyArr[1],
                            data: keyArr[2]
                        })];
                case 9:
                    sharedKey = _d.sent();
                    return [4 /*yield*/, encryption_1.decryptAESGCM({
                            key: sharedKey.data,
                            nonce: misc_1.b64toarr(contentResult.headers.get('X-NONCE')),
                            data: contentResult.arrayBuffer()
                        }).then(function (data) {
                            return cleanConfig(JSON.parse(String.fromCharCode.apply(String, __spreadArray([], __read(new Uint8Array(data.data))))));
                        })];
                case 10:
                    config = _d.sent();
                    return [2 /*return*/, cleanConfig(config)];
                case 11:
                    if (prekeys_1) {
                        throw 'requires pw but not specified';
                    }
                    _d.label = 12;
                case 12:
                    _d.trys.push([12, 14, , 15]);
                    _c = cleanConfig;
                    return [4 /*yield*/, contentResult.json()];
                case 13: return [2 /*return*/, _c.apply(void 0, [_d.sent()])];
                case 14:
                    e_4 = _d.sent();
                    console.warn(e_4);
                    return [2 /*return*/, null];
                case 15: return [2 /*return*/];
            }
        });
    });
};
exports.loadConfig = loadConfig;
function saveConfig(config, storage) {
    if (storage === void 0) { storage = window.localStorage; }
    if (typeof config !== 'string') {
        config = JSON.stringify(config);
    }
    storage.setItem('secretgraphConfig', config);
}
exports.saveConfig = saveConfig;
function exportConfig(config, pws, iterations, name) {
    return __awaiter(this, void 0, void 0, function () {
        var newConfig, mainkey, encrypted, prekeys, pws_1, pws_1_1, pw, _a, _b;
        var e_7, _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    if (pws && typeof pws === 'string') {
                        pws = [pws];
                    }
                    if (typeof config !== 'string') {
                        config = JSON.stringify(config);
                    }
                    if (!(pws && iterations)) return [3 /*break*/, 5];
                    mainkey = crypto.getRandomValues(new Uint8Array(32));
                    return [4 /*yield*/, encryption_1.encryptAESGCM({
                            key: mainkey,
                            data: misc_1.utf8encoder.encode(config)
                        })];
                case 1:
                    encrypted = _e.sent();
                    prekeys = [];
                    try {
                        for (pws_1 = __values(pws), pws_1_1 = pws_1.next(); !pws_1_1.done; pws_1_1 = pws_1.next()) {
                            pw = pws_1_1.value;
                            prekeys.push(encryption_1.encryptPreKey({
                                prekey: mainkey,
                                pw: pw,
                                hashAlgorithm: 'SHA-512',
                                iterations: iterations
                            }));
                        }
                    }
                    catch (e_7_1) { e_7 = { error: e_7_1 }; }
                    finally {
                        try {
                            if (pws_1_1 && !pws_1_1.done && (_c = pws_1["return"])) _c.call(pws_1);
                        }
                        finally { if (e_7) throw e_7.error; }
                    }
                    _b = (_a = JSON).stringify;
                    _d = {};
                    return [4 /*yield*/, encryption_1.serializeToBase64(encrypted.data)];
                case 2:
                    _d.data = _e.sent(),
                        _d.iterations = iterations;
                    return [4 /*yield*/, encryption_1.serializeToBase64(encrypted.nonce)];
                case 3:
                    _d.nonce = _e.sent();
                    return [4 /*yield*/, Promise.all(prekeys)];
                case 4:
                    newConfig = _b.apply(_a, [(_d.prekeys = _e.sent(),
                            _d)]);
                    return [3 /*break*/, 6];
                case 5:
                    newConfig = config;
                    _e.label = 6;
                case 6:
                    if (!name) {
                        return [2 /*return*/, newConfig];
                    }
                    file_saver_1.saveAs(new File([newConfig], name, { type: 'text/plain;charset=utf-8' }));
                    return [2 /*return*/];
            }
        });
    });
}
exports.exportConfig = exportConfig;
function exportConfigAsUrl(_a) {
    var client = _a.client, config = _a.config, pw = _a.pw, _b = _a.iterations, iterations = _b === void 0 ? 100000 : _b;
    return __awaiter(this, void 0, void 0, function () {
        var authInfo, cert, obj, certhashes, searchcerthashes, _c, _d, configContent, _e, _f, keyref, privkeyrefnode, privkeykey, url, sharedKeyPrivateKeyRes, sharedKeyConfigRes, prekey, prekey2, _g, e_8_1, e_9_1;
        var e_9, _h, e_8, _j, _k;
        return __generator(this, function (_l) {
            switch (_l.label) {
                case 0:
                    authInfo = extractAuthInfo({
                        config: config,
                        url: config.baseUrl,
                        clusters: new Set([config.configCluster])
                    });
                    cert = authInfo.certificateHashes.length
                        ? misc_1.b64toarr(config.certificates[authInfo.certificateHashes[0]].data)
                        : null;
                    return [4 /*yield*/, client.query({
                            query: content_1.findConfigQuery,
                            variables: {
                                cluster: config.configCluster,
                                authorization: authInfo.tokens
                            }
                        })];
                case 1:
                    obj = _l.sent();
                    certhashes = [];
                    if (!cert) {
                        return [2 /*return*/, Promise.reject('no cert found')];
                    }
                    return [4 /*yield*/, Promise.all(obj.data.secretgraph.config.hashAlgorithms.map(function (hash) {
                            return crypto.subtle
                                .digest(Constants.mapHashNames[hash].operationName, cert)
                                .then(function (data) { return Buffer.from(data).toString('base64'); });
                        }))];
                case 2:
                    certhashes = _l.sent();
                    searchcerthashes = new Set(authInfo.hashes.map(function (hash) { return "key_hash=" + hash; }));
                    _l.label = 3;
                case 3:
                    _l.trys.push([3, 18, 19, 20]);
                    _c = __values(obj.data.contents.edges), _d = _c.next();
                    _l.label = 4;
                case 4:
                    if (!!_d.done) return [3 /*break*/, 17];
                    configContent = _d.value.node;
                    if (!configContent.tags.includes('type=Config')) {
                        return [3 /*break*/, 16];
                    }
                    _l.label = 5;
                case 5:
                    _l.trys.push([5, 14, 15, 16]);
                    _e = (e_8 = void 0, __values(configContent.references.edges)), _f = _e.next();
                    _l.label = 6;
                case 6:
                    if (!!_f.done) return [3 /*break*/, 13];
                    keyref = _f.value.node;
                    if (keyref.target.tags.findIndex(function (val) {
                        return searchcerthashes.has(val);
                    }) == -1) {
                        return [3 /*break*/, 12];
                    }
                    privkeyrefnode = keyref.target.references.find(function (_a) {
                        var node = _a.node;
                        return node.target.tags;
                    });
                    if (!privkeyrefnode) {
                        return [3 /*break*/, 12];
                    }
                    privkeykey = privkeyrefnode.node.target.tags
                        .find(function (tag) { return tag.startsWith('key='); })
                        .match(/=(.*)/)[1];
                    url = new URL(config.baseUrl, window.location.href);
                    return [4 /*yield*/, encryption_1.decryptRSAOEAP({
                            key: cert,
                            data: privkeykey
                        })];
                case 7:
                    sharedKeyPrivateKeyRes = _l.sent();
                    if (!pw) return [3 /*break*/, 11];
                    sharedKeyConfigRes = encryption_1.decryptRSAOEAP({
                        key: sharedKeyPrivateKeyRes.key,
                        data: keyref.extra
                    });
                    return [4 /*yield*/, encryption_1.encryptPreKey({
                            prekey: sharedKeyPrivateKeyRes.data,
                            pw: pw,
                            hashAlgorithm: 'SHA-512',
                            iterations: iterations
                        })];
                case 8:
                    prekey = _l.sent();
                    _g = encryption_1.encryptPreKey;
                    _k = {};
                    return [4 /*yield*/, sharedKeyConfigRes];
                case 9: return [4 /*yield*/, _g.apply(void 0, [(_k.prekey = (_l.sent()).data,
                            _k.pw = pw,
                            _k.hashAlgorithm = 'SHA-512',
                            _k.iterations = iterations,
                            _k)])];
                case 10:
                    prekey2 = _l.sent();
                    return [2 /*return*/, "" + url.origin + configContent.link + "?decrypt&token=" + authInfo.tokens.join('token=') + "&prekey=" + certhashes[0] + ":" + prekey + "&prekey=shared:" + prekey2];
                case 11: return [2 /*return*/, "" + url.origin + configContent.link + "?decrypt&token=" + authInfo.tokens.join('token=') + "&token=" + certhashes[0] + ":" + Buffer.from(sharedKeyPrivateKeyRes.data).toString('base64')];
                case 12:
                    _f = _e.next();
                    return [3 /*break*/, 6];
                case 13: return [3 /*break*/, 16];
                case 14:
                    e_8_1 = _l.sent();
                    e_8 = { error: e_8_1 };
                    return [3 /*break*/, 16];
                case 15:
                    try {
                        if (_f && !_f.done && (_j = _e["return"])) _j.call(_e);
                    }
                    finally { if (e_8) throw e_8.error; }
                    return [7 /*endfinally*/];
                case 16:
                    _d = _c.next();
                    return [3 /*break*/, 4];
                case 17: return [3 /*break*/, 20];
                case 18:
                    e_9_1 = _l.sent();
                    e_9 = { error: e_9_1 };
                    return [3 /*break*/, 20];
                case 19:
                    try {
                        if (_d && !_d.done && (_h = _c["return"])) _h.call(_c);
                    }
                    finally { if (e_9) throw e_9.error; }
                    return [7 /*endfinally*/];
                case 20: throw Error('no config content found');
            }
        });
    });
}
exports.exportConfigAsUrl = exportConfigAsUrl;
function extractAuthInfo(_a) {
    var _b, _c;
    var config = _a.config, url = _a.url, _d = _a.require, require = _d === void 0 ? new Set(['view', 'update', 'manage']) : _d, props = __rest(_a, ["config", "url", "require"]);
    var keys = new Set();
    var hashes = new Set();
    var certificateHashes = new Set();
    if (url === undefined || url === null) {
        throw Error("no url: " + url);
    }
    var host = config.hosts[new URL(url, window.location.href).href];
    if (host && (!props.content || props.clusters)) {
        for (var id in host.clusters) {
            if (props.clusters && !props.clusters.has(id)) {
                continue;
            }
            var clusterconf = host.clusters[id];
            for (var hash in clusterconf.hashes) {
                if (config.tokens[hash] &&
                    SetOps.hasIntersection(require, clusterconf.hashes[hash])) {
                    hashes.add(hash);
                    keys.add(id + ":" + ((_b = config.tokens[hash]) === null || _b === void 0 ? void 0 : _b.data));
                }
                if (config.certificates[hash]) {
                    certificateHashes.add(hash);
                }
            }
        }
    }
    if (host && props.content) {
        var contentconf = host.contents[props.content];
        for (var hash in contentconf.hashes) {
            if (config.certificates[hash]) {
                certificateHashes.add(hash);
            }
            else if (config.tokens[hash] &&
                SetOps.hasIntersection(require, contentconf.hashes[hash])) {
                if (!config.tokens[hash] || !hash) {
                    console.warn('token not found for:', hash);
                }
                hashes.add(hash);
                keys.add(contentconf.cluster + ":" + ((_c = config.tokens[hash]) === null || _c === void 0 ? void 0 : _c.data));
            }
        }
    }
    // sorted is better for cache
    return {
        certificateHashes: __spreadArray([], __read(certificateHashes)).sort(),
        hashes: __spreadArray([], __read(hashes)).sort(),
        tokens: __spreadArray([], __read(keys)).sort()
    };
}
exports.extractAuthInfo = extractAuthInfo;
function extractPrivKeys(_a) {
    var config = _a.config, url = _a.url, props = __rest(_a, ["config", "url"]);
    var privkeys = props.old || {};
    var urlob = new URL(url, window.location.href);
    var clusters = config.hosts[urlob.href].clusters;
    for (var id in clusters) {
        if (props.clusters && !props.clusters.has(id)) {
            continue;
        }
        var clusterconf = clusters[id];
        for (var hash in clusterconf.hashes) {
            if (config.certificates[hash] && !privkeys[hash]) {
                privkeys[hash] = encryption_1.unserializeToCryptoKey(config.certificates[hash].data, {
                    name: 'RSA-OAEP',
                    hash: Constants.mapHashNames[props.hashAlgorithm]
                        .operationName
                }, 'privateKey');
            }
        }
    }
    return privkeys;
}
exports.extractPrivKeys = extractPrivKeys;
function findCertCandidatesForRefs(config, nodeData) {
    var e_10, _a, e_11, _b, e_12, _c, e_13, _d, e_14, _e;
    var found = [];
    // extract tag key from private key
    if (nodeData.tags.includes('type=PrivateKey')) {
        var hashes = [];
        try {
            for (var _f = __values(nodeData.tags), _g = _f.next(); !_g.done; _g = _f.next()) {
                var tag = _g.value;
                if (tag.startsWith('key_hash=')) {
                    var _h = __read(tag.match(/=(?:([^:]*?):)?([^:]*)/), 3), _ = _h[0], hashAlgorithm = _h[1], cleanhash = _h[2];
                    if (cleanhash) {
                        if (hashAlgorithm &&
                            config.certificates[hashAlgorithm + ":" + cleanhash]) {
                            hashes.push({ hash: cleanhash, hashAlgorithm: hashAlgorithm });
                        }
                        else if (config.certificates[cleanhash]) {
                            hashes.push({
                                hash: cleanhash,
                                hashAlgorithm: undefined
                            });
                        }
                    }
                }
            }
        }
        catch (e_10_1) { e_10 = { error: e_10_1 }; }
        finally {
            try {
                if (_g && !_g.done && (_a = _f["return"])) _a.call(_f);
            }
            finally { if (e_10) throw e_10.error; }
        }
        try {
            for (var _j = __values(nodeData.tags), _k = _j.next(); !_k.done; _k = _j.next()) {
                var tag = _k.value;
                if (tag.startsWith('key=')) {
                    try {
                        for (var hashes_1 = (e_12 = void 0, __values(hashes)), hashes_1_1 = hashes_1.next(); !hashes_1_1.done; hashes_1_1 = hashes_1.next()) {
                            var _l = hashes_1_1.value, hash = _l.hash, hashAlgorithm = _l.hashAlgorithm;
                            var _m = __read(tag.match(/=(?:([^:]*?):)?([^:]*)/), 3), _ = _m[0], hashAlgorithm2 = _m[1], shared = _m[2];
                            found.push({
                                hash: hash,
                                hashAlgorithm: hashAlgorithm2 || hashAlgorithm,
                                sharedKey: misc_1.b64toarr(shared)
                            });
                        }
                    }
                    catch (e_12_1) { e_12 = { error: e_12_1 }; }
                    finally {
                        try {
                            if (hashes_1_1 && !hashes_1_1.done && (_c = hashes_1["return"])) _c.call(hashes_1);
                        }
                        finally { if (e_12) throw e_12.error; }
                    }
                    // there is only one key
                    break;
                }
            }
        }
        catch (e_11_1) { e_11 = { error: e_11_1 }; }
        finally {
            try {
                if (_k && !_k.done && (_b = _j["return"])) _b.call(_j);
            }
            finally { if (e_11) throw e_11.error; }
        }
    }
    try {
        // extract tags with hashes
        for (var _o = __values(nodeData.references.edges), _p = _o.next(); !_p.done; _p = _o.next()) {
            var refnode = _p.value.node;
            try {
                for (var _q = (e_14 = void 0, __values(refnode.target.tags)), _r = _q.next(); !_r.done; _r = _q.next()) {
                    var dirtyhash = _r.value;
                    var _s = __read(dirtyhash.match(/^[^=]+=(?:([^:]*?):)?([^:]*)/), 3), _ = _s[0], hashAlgorithm = _s[1], cleanhash = _s[2];
                    if (cleanhash) {
                        if (config.certificates[hashAlgorithm + ":" + cleanhash]) {
                            var _t = __read(refnode.extra.match(/^(?:([^:]*?):)?([^:]*)/), 3), _1 = _t[0], hashAlgorithm2 = _t[1], b64 = _t[2];
                            found.push({
                                hash: hashAlgorithm + ":" + cleanhash,
                                hashAlgorithm: hashAlgorithm2 || hashAlgorithm,
                                sharedKey: misc_1.b64toarr(b64)
                            });
                        }
                        else if (config.certificates[cleanhash]) {
                            var _u = __read(refnode.extra.match(/^(?:([^:]*?):)?([^:]*)/), 3), _2 = _u[0], hashAlgorithm2 = _u[1], b64 = _u[2];
                            found.push({
                                hash: cleanhash,
                                hashAlgorithm: hashAlgorithm2 || hashAlgorithm,
                                sharedKey: misc_1.b64toarr(b64)
                            });
                        }
                    }
                }
            }
            catch (e_14_1) { e_14 = { error: e_14_1 }; }
            finally {
                try {
                    if (_r && !_r.done && (_e = _q["return"])) _e.call(_q);
                }
                finally { if (e_14) throw e_14.error; }
            }
        }
    }
    catch (e_13_1) { e_13 = { error: e_13_1 }; }
    finally {
        try {
            if (_p && !_p.done && (_d = _o["return"])) _d.call(_o);
        }
        finally { if (e_13) throw e_13.error; }
    }
    return found;
}
exports.findCertCandidatesForRefs = findCertCandidatesForRefs;
function updateConfig(old, update) {
    var e_15, _a;
    var count = 0;
    var newState = old
        ? Object.assign({}, old)
        : {};
    try {
        for (var _b = __values(Object.keys(update)), _c = _b.next(); !_c.done; _c = _b.next()) {
            var key = _c.value;
            var res = void 0;
            var val = update[key];
            switch (key) {
                case 'certificates':
                case 'tokens':
                    res = misc_1.mergeDeleteObjects(newState[key], val);
                    newState[key] = res[0];
                    count += res[1];
                    break;
                case 'hosts':
                    res = misc_1.mergeDeleteObjects(newState.hosts, update.hosts, function (oldval, newval) {
                        var count = 0;
                        var newState = oldval
                            ? Object.assign({}, oldval)
                            : {
                                clusters: {},
                                contents: {}
                            };
                        if (newval.clusters) {
                            var res_1 = misc_1.mergeDeleteObjects(newState.clusters, newval.clusters, function (oldval, newval) {
                                count = 0;
                                var newState = oldval
                                    ? Object.assign({}, oldval)
                                    : {
                                        hashes: {}
                                    };
                                if (newval.hashes) {
                                    var res_2 = misc_1.mergeDeleteObjects(newState.hashes, newval.hashes, 
                                    // replace if not undefined, we have arrays
                                    function (old, newobj) {
                                        return [newobj, 1];
                                    });
                                    newState.hashes = res_2[0];
                                    count += res_2[1];
                                }
                                return [newState, count];
                            });
                            newState.clusters = res_1[0];
                            count += res_1[1];
                        }
                        if (newval.contents) {
                            var res_3 = misc_1.mergeDeleteObjects(newState.contents, newval.contents, function (oldval, newval) {
                                var count = 0;
                                var newState = oldval
                                    ? Object.assign({}, oldval)
                                    : {
                                        hashes: {},
                                        cluster: ''
                                    };
                                if (newval.hashes) {
                                    var res_4 = misc_1.mergeDeleteObjects(newState.hashes, newval.hashes);
                                    newState.hashes = res_4[0];
                                    count += res_4[1];
                                }
                                if (newval.cluster) {
                                    newState.cluster = newval.cluster;
                                }
                                if (!newState.cluster) {
                                    throw Error('cluster is missing');
                                }
                                return [newState, count];
                            });
                            newState.contents = res_3[0];
                            count += res_3[1];
                        }
                        return [newState, count];
                    });
                    newState[key] = res[0];
                    count += res[1];
                    break;
                default:
                    if (val && (!newState[key] || newState[key] != val)) {
                        newState[key] =
                            val;
                        count++;
                    }
                    break;
            }
        }
    }
    catch (e_15_1) { e_15 = { error: e_15_1 }; }
    finally {
        try {
            if (_c && !_c.done && (_a = _b["return"])) _a.call(_b);
        }
        finally { if (e_15) throw e_15.error; }
    }
    var ret = cleanConfig(newState);
    if (!ret) {
        throw Error('invalid merge');
    }
    return [ret, count];
}
exports.updateConfig = updateConfig;
function updateConfigReducer(state, _a) {
    var update = _a.update, replace = _a.replace;
    if (update === null) {
        return null;
    }
    if (replace) {
        return update;
    }
    return updateConfig(state, update)[0];
}
exports.updateConfigReducer = updateConfigReducer;
// update host specific or find a way to find missing refs
/**
export async function updateHash(config: ConfigInterface, old?: string) {
  const newHash = config.hosts[config.baseUrl].hashAlgorithms[0]
  if(old == newHash){
    return config
  }
  const updateMap = new Map<string, string>();
  const ret =  {
    ...config,
    certificates: Object.fromEntries(await Promise.all(Object.entries(config.certificates).map(async([hash, val]) =>{
      let newHash = updateMap.get(hash);
      if (!updateMap.has(hash)){
        updateMap.set(hash, await serializeToBase64(unserializeToArrayBuffer(val).then((buf) => crypto.subtle.digest(
          mapHashNames[""+newHash].operationName, buf
        ))))
      }
      return [
        updateMap.get(hash),
        val
      ]
    }))),
    tokens: Object.fromEntries(await Promise.all(Object.entries(config.tokens).map(async([hash, val]) =>{
      let newHash = updateMap.get(hash);
      if (!updateMap.has(hash)){
        updateMap.set(hash, await serializeToBase64(unserializeToArrayBuffer(val).then((buf) => crypto.subtle.digest(
          mapHashNames[""+newHash].operationName, buf
        ))))
      }
      return [
        updateMap.get(hash),
        val
      ]
    })))
  }
  return ret
} */
//# sourceMappingURL=config.js.map