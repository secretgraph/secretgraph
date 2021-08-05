"use strict";
var __makeTemplateObject = (this && this.__makeTemplateObject) || function (cooked, raw) {
    if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
    return cooked;
};
exports.__esModule = true;
exports.serverConfigQuery = void 0;
var client_1 = require("@apollo/client");
exports.serverConfigQuery = client_1.gql(templateObject_1 || (templateObject_1 = __makeTemplateObject(["\n    query serverSecretgraphConfigQuery {\n        secretgraph {\n            config {\n                id\n                hashAlgorithms\n                injectedClusters {\n                    group\n                    clusters\n                    keys {\n                        link\n                        hash\n                    }\n                }\n                registerUrl\n            }\n        }\n    }\n"], ["\n    query serverSecretgraphConfigQuery {\n        secretgraph {\n            config {\n                id\n                hashAlgorithms\n                injectedClusters {\n                    group\n                    clusters\n                    keys {\n                        link\n                        hash\n                    }\n                }\n                registerUrl\n            }\n        }\n    }\n"])));
var templateObject_1;
//# sourceMappingURL=server.js.map