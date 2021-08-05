"use strict";
exports.__esModule = true;
exports.extractNameNote = void 0;
function extractNameNote(description) {
    var name, note = null;
    if (description.includes('\u001F')) {
        var split = description.split('\u001F');
        name = split[0];
        note = split[1];
    }
    else {
        name = description;
    }
    return {
        name: name,
        note: note
    };
}
exports.extractNameNote = extractNameNote;
//# sourceMappingURL=cluster.js.map