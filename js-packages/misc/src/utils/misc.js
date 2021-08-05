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
exports.deepEqual = exports.mergeDeleteObjects = exports.sortedHash = exports.b64toutf8 = exports.b64toarr = exports.utf8ToBinary = exports.utf8decoder = exports.utf8encoder = void 0;
exports.utf8encoder = new TextEncoder();
exports.utf8decoder = new TextDecoder();
function utf8ToBinary(inp) {
    return String.fromCharCode.apply(String, __spreadArray([], __read(exports.utf8encoder.encode(inp))));
}
exports.utf8ToBinary = utf8ToBinary;
function b64toarr(inp) {
    return new Uint8Array(Buffer.from(inp, 'base64').buffer);
}
exports.b64toarr = b64toarr;
function b64toutf8(inp) {
    return exports.utf8decoder.decode(b64toarr(inp));
}
exports.b64toutf8 = b64toutf8;
function sortedHash(inp, algo) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, crypto.subtle
                        .digest(algo, exports.utf8encoder.encode(inp.sort().join('')))
                        .then(function (data) { return Buffer.from(data).toString('base64'); })];
                case 1: return [2 /*return*/, _a.sent()];
            }
        });
    });
}
exports.sortedHash = sortedHash;
function mergeDeleteObjects(oldObj, newObj, objHandler) {
    var e_1, _a;
    if (objHandler === void 0) { objHandler = mergeDeleteObjects; }
    var count = 0;
    var copied = oldObj ? Object.assign({}, oldObj) : {};
    try {
        for (var _b = __values(Object.entries(newObj)), _c = _b.next(); !_c.done; _c = _b.next()) {
            var _d = __read(_c.value, 2), key = _d[0], value = _d[1];
            if (!key) {
                continue;
            }
            if (value === null) {
                if (copied[key]) {
                    delete copied[key];
                    count++;
                }
            }
            else if (typeof value === 'object') {
                var ret = objHandler(copied[key], value);
                copied[key] = ret[0];
                count += ret[1];
            }
            else if (value !== undefined) {
                if (copied[key] != value) {
                    copied[key] = value;
                    count++;
                }
            }
        }
    }
    catch (e_1_1) { e_1 = { error: e_1_1 }; }
    finally {
        try {
            if (_c && !_c.done && (_a = _b["return"])) _a.call(_b);
        }
        finally { if (e_1) throw e_1.error; }
    }
    return [copied, count];
}
exports.mergeDeleteObjects = mergeDeleteObjects;
function deepEqual(a, b) {
    var e_2, _a, e_3, _b, e_4, _c, e_5, _d;
    if (a === null || b === null) {
        return a === b;
    }
    if (a instanceof Set || b instanceof Set) {
        if (!(a instanceof Set && b instanceof Set)) {
            return false;
        }
        if (a.size != b.size) {
            return false;
        }
        try {
            for (var a_1 = __values(a), a_1_1 = a_1.next(); !a_1_1.done; a_1_1 = a_1.next()) {
                var key = a_1_1.value;
                if (!b.has(key)) {
                    return false;
                }
            }
        }
        catch (e_2_1) { e_2 = { error: e_2_1 }; }
        finally {
            try {
                if (a_1_1 && !a_1_1.done && (_a = a_1["return"])) _a.call(a_1);
            }
            finally { if (e_2) throw e_2.error; }
        }
        return true;
    }
    else if (typeof a == 'object' && typeof b == 'object') {
        var keys = new Set();
        try {
            for (var _e = __values(a instanceof Array || a instanceof Map
                ? a.keys()
                : Object.keys(a)), _f = _e.next(); !_f.done; _f = _e.next()) {
                var key = _f.value;
                keys.add(key);
            }
        }
        catch (e_3_1) { e_3 = { error: e_3_1 }; }
        finally {
            try {
                if (_f && !_f.done && (_b = _e["return"])) _b.call(_e);
            }
            finally { if (e_3) throw e_3.error; }
        }
        try {
            for (var _g = __values(b instanceof Array || b instanceof Map
                ? b
                : Object.keys(b)), _h = _g.next(); !_h.done; _h = _g.next()) {
                var key = _h.value;
                keys.add(key);
            }
        }
        catch (e_4_1) { e_4 = { error: e_4_1 }; }
        finally {
            try {
                if (_h && !_h.done && (_c = _g["return"])) _c.call(_g);
            }
            finally { if (e_4) throw e_4.error; }
        }
        try {
            for (var keys_1 = __values(keys), keys_1_1 = keys_1.next(); !keys_1_1.done; keys_1_1 = keys_1.next()) {
                var key = keys_1_1.value;
                if (!deepEqual(a[key], b[key])) {
                    return false;
                }
            }
        }
        catch (e_5_1) { e_5 = { error: e_5_1 }; }
        finally {
            try {
                if (keys_1_1 && !keys_1_1.done && (_d = keys_1["return"])) _d.call(keys_1);
            }
            finally { if (e_5) throw e_5.error; }
        }
        return true;
    }
    else {
        return a === b;
    }
}
exports.deepEqual = deepEqual;
//# sourceMappingURL=misc.js.map