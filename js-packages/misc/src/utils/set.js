"use strict";
// taken from https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set
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
exports.isNotEq = exports.difference = exports.symmetricDifference = exports.intersection = exports.hasIntersection = exports.union = exports.isSuperset = void 0;
function isSuperset(set, subset) {
    var e_1, _a;
    try {
        for (var subset_1 = __values(subset), subset_1_1 = subset_1.next(); !subset_1_1.done; subset_1_1 = subset_1.next()) {
            var elem = subset_1_1.value;
            if (!set.has(elem)) {
                return false;
            }
        }
    }
    catch (e_1_1) { e_1 = { error: e_1_1 }; }
    finally {
        try {
            if (subset_1_1 && !subset_1_1.done && (_a = subset_1["return"])) _a.call(subset_1);
        }
        finally { if (e_1) throw e_1.error; }
    }
    return true;
}
exports.isSuperset = isSuperset;
function union(setA, setB) {
    var e_2, _a;
    var _union = new Set(setA);
    try {
        for (var setB_1 = __values(setB), setB_1_1 = setB_1.next(); !setB_1_1.done; setB_1_1 = setB_1.next()) {
            var elem = setB_1_1.value;
            _union.add(elem);
        }
    }
    catch (e_2_1) { e_2 = { error: e_2_1 }; }
    finally {
        try {
            if (setB_1_1 && !setB_1_1.done && (_a = setB_1["return"])) _a.call(setB_1);
        }
        finally { if (e_2) throw e_2.error; }
    }
    return _union;
}
exports.union = union;
function hasIntersection(setA, elements) {
    var e_3, _a;
    try {
        for (var elements_1 = __values(elements), elements_1_1 = elements_1.next(); !elements_1_1.done; elements_1_1 = elements_1.next()) {
            var elem = elements_1_1.value;
            if (setA.has(elem)) {
                return true;
            }
        }
    }
    catch (e_3_1) { e_3 = { error: e_3_1 }; }
    finally {
        try {
            if (elements_1_1 && !elements_1_1.done && (_a = elements_1["return"])) _a.call(elements_1);
        }
        finally { if (e_3) throw e_3.error; }
    }
    return false;
}
exports.hasIntersection = hasIntersection;
function intersection(setA, setB) {
    var e_4, _a;
    var _intersection = new Set();
    try {
        for (var setB_2 = __values(setB), setB_2_1 = setB_2.next(); !setB_2_1.done; setB_2_1 = setB_2.next()) {
            var elem = setB_2_1.value;
            if (setA.has(elem)) {
                _intersection.add(elem);
            }
        }
    }
    catch (e_4_1) { e_4 = { error: e_4_1 }; }
    finally {
        try {
            if (setB_2_1 && !setB_2_1.done && (_a = setB_2["return"])) _a.call(setB_2);
        }
        finally { if (e_4) throw e_4.error; }
    }
    return _intersection;
}
exports.intersection = intersection;
function symmetricDifference(setA, setB) {
    var e_5, _a;
    var _difference = new Set(setB);
    try {
        for (var setA_1 = __values(setA), setA_1_1 = setA_1.next(); !setA_1_1.done; setA_1_1 = setA_1.next()) {
            var elem = setA_1_1.value;
            if (_difference.has(elem)) {
                _difference["delete"](elem);
            }
            else {
                _difference.add(elem);
            }
        }
    }
    catch (e_5_1) { e_5 = { error: e_5_1 }; }
    finally {
        try {
            if (setA_1_1 && !setA_1_1.done && (_a = setA_1["return"])) _a.call(setA_1);
        }
        finally { if (e_5) throw e_5.error; }
    }
    return _difference;
}
exports.symmetricDifference = symmetricDifference;
function difference(setA, setB) {
    var e_6, _a;
    var _difference = new Set(setA);
    try {
        for (var setB_3 = __values(setB), setB_3_1 = setB_3.next(); !setB_3_1.done; setB_3_1 = setB_3.next()) {
            var elem = setB_3_1.value;
            _difference["delete"](elem);
        }
    }
    catch (e_6_1) { e_6 = { error: e_6_1 }; }
    finally {
        try {
            if (setB_3_1 && !setB_3_1.done && (_a = setB_3["return"])) _a.call(setB_3);
        }
        finally { if (e_6) throw e_6.error; }
    }
    return _difference;
}
exports.difference = difference;
function isNotEq(setA, elements) {
    var e_7, _a;
    var count = 0;
    try {
        for (var elements_2 = __values(elements), elements_2_1 = elements_2.next(); !elements_2_1.done; elements_2_1 = elements_2.next()) {
            var elem = elements_2_1.value;
            if (!setA.has(elem)) {
                return true;
            }
            count++;
        }
    }
    catch (e_7_1) { e_7 = { error: e_7_1 }; }
    finally {
        try {
            if (elements_2_1 && !elements_2_1.done && (_a = elements_2["return"])) _a.call(elements_2);
        }
        finally { if (e_7) throw e_7.error; }
    }
    return setA.size != count;
}
exports.isNotEq = isNotEq;
//# sourceMappingURL=set.js.map