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
exports.transformActions = exports.generateActionMapper = void 0;
var Constants = __importStar(require("../constants"));
var encryption_1 = require("./encryption");
var SetOps = __importStar(require("./set"));
var actionMatcher = /:(.*)/;
function generateActionMapper(_a) {
    var nodeData = _a.nodeData, config = _a.config, knownHashesIntern = _a.knownHashes, unknownTokens = _a.unknownTokens, unknownKeyhashes = _a.unknownKeyhashes, hashAlgorithm = _a.hashAlgorithm;
    return __awaiter(this, void 0, void 0, function () {
        var knownHashes, _b, _c, k, k_1, k_1_1, el, _d, _e, _f, hash, val, prepareActionsAndCerts, inNodeFoundActions, _g, _h, entry, hashalgo, _loop_1, _j, _k, _l, hash, configActions, _loop_2, unknownTokens_1, unknownTokens_1_1, token, _loop_3, unknownKeyhashes_1, unknownKeyhashes_1_1, hash, actions, _m, _o, entry, e_1_1;
        var e_2, _p, e_3, _q, e_4, _r, e_5, _s, e_6, _t, e_7, _u, e_8, _v, e_1, _w;
        return __generator(this, function (_x) {
            switch (_x.label) {
                case 0:
                    knownHashes = {};
                    try {
                        for (_b = __values(knownHashesIntern || []), _c = _b.next(); !_c.done; _c = _b.next()) {
                            k = _c.value;
                            if (k instanceof Array) {
                                try {
                                    for (k_1 = (e_3 = void 0, __values(k)), k_1_1 = k_1.next(); !k_1_1.done; k_1_1 = k_1.next()) {
                                        el = k_1_1.value;
                                        if (!knownHashes[el.keyHash]) {
                                            knownHashes[el.keyHash] = new Set([el.type]);
                                        }
                                        else {
                                            knownHashes[el.keyHash].add(el.type);
                                        }
                                    }
                                }
                                catch (e_3_1) { e_3 = { error: e_3_1 }; }
                                finally {
                                    try {
                                        if (k_1_1 && !k_1_1.done && (_q = k_1["return"])) _q.call(k_1);
                                    }
                                    finally { if (e_3) throw e_3.error; }
                                }
                            }
                            else {
                                try {
                                    for (_d = (e_4 = void 0, __values(Object.entries(k))), _e = _d.next(); !_e.done; _e = _d.next()) {
                                        _f = __read(_e.value, 2), hash = _f[0], val = _f[1];
                                        knownHashes[hash] = SetOps.union(knownHashes[hash] || [], val);
                                    }
                                }
                                catch (e_4_1) { e_4 = { error: e_4_1 }; }
                                finally {
                                    try {
                                        if (_e && !_e.done && (_r = _d["return"])) _r.call(_d);
                                    }
                                    finally { if (e_4) throw e_4.error; }
                                }
                            }
                        }
                    }
                    catch (e_2_1) { e_2 = { error: e_2_1 }; }
                    finally {
                        try {
                            if (_c && !_c.done && (_p = _b["return"])) _p.call(_b);
                        }
                        finally { if (e_2) throw e_2.error; }
                    }
                    prepareActionsAndCerts = [];
                    inNodeFoundActions = {};
                    try {
                        for (_g = __values((nodeData === null || nodeData === void 0 ? void 0 : nodeData.availableActions) || []), _h = _g.next(); !_h.done; _h = _g.next()) {
                            entry = _h.value;
                            if (!inNodeFoundActions[entry.keyHash]) {
                                inNodeFoundActions[entry.keyHash] = new Set();
                            }
                            inNodeFoundActions[entry.keyHash].add(entry.type);
                        }
                    }
                    catch (e_5_1) { e_5 = { error: e_5_1 }; }
                    finally {
                        try {
                            if (_h && !_h.done && (_s = _g["return"])) _s.call(_g);
                        }
                        finally { if (e_5) throw e_5.error; }
                    }
                    hashalgo = Constants.mapHashNames[hashAlgorithm].operationName;
                    _loop_1 = function (hash, configActions) {
                        if (config.tokens[hash]) {
                            prepareActionsAndCerts.push(encryption_1.serializeToBase64(encryption_1.unserializeToArrayBuffer(config.tokens[hash].data).then(function (val) { return crypto.subtle.digest(hashalgo, val); })).then(function (val) {
                                var newSet = inNodeFoundActions[val]
                                    ? new Set(inNodeFoundActions[val])
                                    : new Set();
                                if (newSet.has('other')) {
                                    newSet["delete"]('other');
                                    newSet = SetOps.union(newSet, SetOps.difference(configActions, Constants.protectedActions));
                                }
                                return {
                                    type: 'action',
                                    newHash: val,
                                    oldHash: hash,
                                    note: config.tokens[hash].note,
                                    data: config.tokens[hash].data,
                                    configActions: configActions,
                                    foundActions: newSet
                                };
                            }));
                        }
                    };
                    try {
                        for (_j = __values(Object.entries(knownHashes)), _k = _j.next(); !_k.done; _k = _j.next()) {
                            _l = __read(_k.value, 2), hash = _l[0], configActions = _l[1];
                            _loop_1(hash, configActions);
                        }
                    }
                    catch (e_6_1) { e_6 = { error: e_6_1 }; }
                    finally {
                        try {
                            if (_k && !_k.done && (_t = _j["return"])) _t.call(_j);
                        }
                        finally { if (e_6) throw e_6.error; }
                    }
                    if (unknownTokens) {
                        _loop_2 = function (token) {
                            var match = token.match(actionMatcher)[1];
                            if (!match) {
                                return "continue";
                            }
                            var prom = encryption_1.serializeToBase64(encryption_1.unserializeToArrayBuffer(match).then(function (val) {
                                return crypto.subtle.digest(hashalgo, val);
                            }));
                            prepareActionsAndCerts.push(prom.then(function (val) {
                                if (config.certificates[val]) {
                                    return {
                                        type: 'certificate',
                                        newHash: val,
                                        oldHash: val,
                                        note: config.certificates[val].note,
                                        data: config.certificates[val].data
                                    };
                                }
                                return null;
                            }));
                            prepareActionsAndCerts.push(prom.then(function (val) {
                                if (knownHashes && knownHashes[val]) {
                                    return null;
                                }
                                return {
                                    type: 'action',
                                    data: token,
                                    note: '',
                                    newHash: val,
                                    oldHash: null,
                                    configActions: new Set(),
                                    foundActions: inNodeFoundActions[val] || new Set()
                                };
                            }));
                        };
                        try {
                            for (unknownTokens_1 = __values(unknownTokens), unknownTokens_1_1 = unknownTokens_1.next(); !unknownTokens_1_1.done; unknownTokens_1_1 = unknownTokens_1.next()) {
                                token = unknownTokens_1_1.value;
                                _loop_2(token);
                            }
                        }
                        catch (e_7_1) { e_7 = { error: e_7_1 }; }
                        finally {
                            try {
                                if (unknownTokens_1_1 && !unknownTokens_1_1.done && (_u = unknownTokens_1["return"])) _u.call(unknownTokens_1);
                            }
                            finally { if (e_7) throw e_7.error; }
                        }
                    }
                    if (unknownKeyhashes) {
                        _loop_3 = function (hash) {
                            if (config.tokens[hash]) {
                                prepareActionsAndCerts.push(encryption_1.serializeToBase64(encryption_1.unserializeToArrayBuffer(config.tokens[hash].data).then(function (val) { return crypto.subtle.digest(hashalgo, val); })).then(function (val) {
                                    return {
                                        type: 'action',
                                        newHash: val,
                                        oldHash: hash,
                                        note: config.tokens[hash].note,
                                        data: config.tokens[hash].data,
                                        configActions: new Set(),
                                        foundActions: inNodeFoundActions[val] || new Set()
                                    };
                                }));
                            }
                            if (config.certificates[hash]) {
                                prepareActionsAndCerts.push(encryption_1.serializeToBase64(encryption_1.unserializeToArrayBuffer(config.certificates[hash].data).then(function (val) { return crypto.subtle.digest(hashalgo, val); })).then(function (val) {
                                    var cert = config.certificates[hash];
                                    return {
                                        type: 'certificate',
                                        newHash: val,
                                        oldHash: hash,
                                        note: cert.note,
                                        data: cert.data
                                    };
                                }));
                            }
                        };
                        try {
                            for (unknownKeyhashes_1 = __values(unknownKeyhashes), unknownKeyhashes_1_1 = unknownKeyhashes_1.next(); !unknownKeyhashes_1_1.done; unknownKeyhashes_1_1 = unknownKeyhashes_1.next()) {
                                hash = unknownKeyhashes_1_1.value;
                                _loop_3(hash);
                            }
                        }
                        catch (e_8_1) { e_8 = { error: e_8_1 }; }
                        finally {
                            try {
                                if (unknownKeyhashes_1_1 && !unknownKeyhashes_1_1.done && (_v = unknownKeyhashes_1["return"])) _v.call(unknownKeyhashes_1);
                            }
                            finally { if (e_8) throw e_8.error; }
                        }
                    }
                    actions = {};
                    _x.label = 1;
                case 1:
                    _x.trys.push([1, 6, 7, 8]);
                    return [4 /*yield*/, Promise.all(prepareActionsAndCerts)];
                case 2:
                    _m = __values.apply(void 0, [_x.sent()]), _o = _m.next();
                    _x.label = 3;
                case 3:
                    if (!!_o.done) return [3 /*break*/, 5];
                    entry = _o.value;
                    if (!entry) {
                        return [3 /*break*/, 4];
                    }
                    if (!actions[entry.newHash]) {
                        actions[entry.newHash] = entry;
                    }
                    _x.label = 4;
                case 4:
                    _o = _m.next();
                    return [3 /*break*/, 3];
                case 5: return [3 /*break*/, 8];
                case 6:
                    e_1_1 = _x.sent();
                    e_1 = { error: e_1_1 };
                    return [3 /*break*/, 8];
                case 7:
                    try {
                        if (_o && !_o.done && (_w = _m["return"])) _w.call(_m);
                    }
                    finally { if (e_1) throw e_1.error; }
                    return [7 /*endfinally*/];
                case 8: return [2 /*return*/, actions];
            }
        });
    });
}
exports.generateActionMapper = generateActionMapper;
function transformActions(_a) {
    var actions = _a.actions, hashAlgorithm = _a.hashAlgorithm, _mapper = _a.mapper;
    return __awaiter(this, void 0, void 0, function () {
        var mapper, finishedActions, configUpdate, hashes;
        var _this = this;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, _mapper];
                case 1:
                    mapper = _b.sent();
                    finishedActions = [];
                    configUpdate = {
                        hosts: {},
                        tokens: {},
                        certificates: {}
                    };
                    hashes = {};
                    return [4 /*yield*/, Promise.all(actions.map(function (val) { return __awaiter(_this, void 0, void 0, function () {
                            var newHash, _a, _b, _c, _d, _e, mapperval, activeHash, newHashValues, _f, _g, v, _h, _j, v;
                            var e_9, _k, e_10, _l;
                            return __generator(this, function (_m) {
                                switch (_m.label) {
                                    case 0:
                                        if (val.readonly) {
                                            return [2 /*return*/];
                                        }
                                        _a = val.newHash;
                                        if (_a) return [3 /*break*/, 3];
                                        _b = encryption_1.serializeToBase64;
                                        _d = (_c = crypto.subtle).digest;
                                        _e = [hashAlgorithm];
                                        return [4 /*yield*/, encryption_1.unserializeToArrayBuffer(val.data)];
                                    case 1: return [4 /*yield*/, _b.apply(void 0, [_d.apply(_c, _e.concat([_m.sent()]))])];
                                    case 2:
                                        _a = (_m.sent());
                                        _m.label = 3;
                                    case 3:
                                        newHash = _a;
                                        mapperval = mapper && mapper[newHash] ? mapper[newHash] : undefined;
                                        // delete action
                                        if (val["delete"]) {
                                            if (!val.oldHash) {
                                                throw Error('requires oldHash');
                                            }
                                            finishedActions.push({
                                                existingHash: val.oldHash,
                                                value: '"delete"'
                                            });
                                            configUpdate.tokens[val.oldHash] = null;
                                            console.debug('hash of deleted object:', val.oldHash);
                                            return [2 /*return*/];
                                        }
                                        activeHash = newHash;
                                        if (val.update) {
                                            if (!mapperval) {
                                                throw Error('requires mapper');
                                            }
                                            if (mapperval.type == 'action') {
                                                newHashValues = new Set();
                                                try {
                                                    for (_f = __values(mapperval.configActions), _g = _f.next(); !_g.done; _g = _f.next()) {
                                                        v = _g.value;
                                                        if (!Constants.protectedActions.has(v)) {
                                                            if (mapperval.foundActions.has(v)) {
                                                                newHashValues.add(v);
                                                            }
                                                        }
                                                        else {
                                                            if (mapperval.foundActions.has('other')) {
                                                                newHashValues.add(v);
                                                            }
                                                        }
                                                    }
                                                }
                                                catch (e_9_1) { e_9 = { error: e_9_1 }; }
                                                finally {
                                                    try {
                                                        if (_g && !_g.done && (_k = _f["return"])) _k.call(_f);
                                                    }
                                                    finally { if (e_9) throw e_9.error; }
                                                }
                                                try {
                                                    for (_h = __values(mapperval.configActions), _j = _h.next(); !_j.done; _j = _h.next()) {
                                                        v = _j.value;
                                                        if (v == 'other') {
                                                            if (!newHashValues.size) {
                                                                newHashValues.add(v);
                                                            }
                                                        }
                                                        else {
                                                            newHashValues.add(v);
                                                        }
                                                    }
                                                }
                                                catch (e_10_1) { e_10 = { error: e_10_1 }; }
                                                finally {
                                                    try {
                                                        if (_j && !_j.done && (_l = _h["return"])) _l.call(_h);
                                                    }
                                                    finally { if (e_10) throw e_10.error; }
                                                }
                                                hashes[newHash] = __spreadArray([], __read(newHashValues));
                                                if (mapperval.oldHash && val.newHash != mapperval.oldHash) {
                                                    hashes[mapperval.oldHash] = null;
                                                    configUpdate.tokens[mapperval.oldHash] = null;
                                                }
                                            }
                                            else {
                                                hashes[newHash] = [];
                                                if (mapperval.oldHash && val.newHash != mapperval.oldHash) {
                                                    hashes[mapperval.oldHash] = null;
                                                    configUpdate.certificates[mapperval.oldHash] = null;
                                                }
                                            }
                                        }
                                        else if (mapperval === null || mapperval === void 0 ? void 0 : mapperval.oldHash) {
                                            activeHash = mapperval.oldHash;
                                        }
                                        if (val.type == 'action') {
                                            // update note or create new entry
                                            if (!mapperval || val.update || mapperval.note != val.note) {
                                                configUpdate.tokens[activeHash] = {
                                                    data: val.data,
                                                    note: val.note
                                                };
                                            }
                                            if (val.locked) {
                                                return [2 /*return*/];
                                            }
                                            if (!hashes[activeHash]) {
                                                hashes[activeHash] = [];
                                            }
                                            ;
                                            hashes[activeHash].push(val.value.action);
                                            // send updates
                                            finishedActions.push({
                                                existingHash: val.oldHash || undefined,
                                                start: val.start ? new Date(val.start) : undefined,
                                                stop: val.stop ? new Date(val.stop) : undefined,
                                                value: JSON.stringify(val.value),
                                                key: val.data
                                            });
                                        }
                                        else {
                                            // update note or create new entry
                                            if (!mapperval || val.update || mapperval.note != val.note) {
                                                configUpdate.certificates[activeHash] = {
                                                    data: val.data,
                                                    note: val.note
                                                };
                                            }
                                        }
                                        return [2 /*return*/];
                                }
                            });
                        }); }))];
                case 2:
                    _b.sent();
                    return [2 /*return*/, {
                            configUpdate: configUpdate,
                            actions: finishedActions,
                            hashes: hashes
                        }];
            }
        });
    });
}
exports.transformActions = transformActions;
//# sourceMappingURL=action.js.map