import { Namespace } from "rdflib";

declare var gettext: any;

export const contentStates = new Map([
  ['default', { label: gettext('Default') }],
  ['draft', { label: gettext('Draft') }],
  ['internal', {label: gettext('Internal') }],
  ['public', { label: gettext('Public') }],
]);

export const mapHashNames: { [algo: string]: {readonly name: string, readonly length: number} } = {
  "sha512": {name: "SHA-512", length: 512},
  "SHA-512": {name: "SHA-512", length: 512},
  "sha256": {name: "SHA-256", length: 256},
  "SHA-256": {name: "SHA-256", length: 256}
}

export const mapEncryptionAlgorithms: {readonly [algo: string]: {readonly usages: KeyUsage[]} } = {
  "PBKDF2": {usages: ["deriveBits", "deriveKey"]},
  "RSA-PSSprivate": {usages: ["sign"]},
  "RSA-PSSpublic": {usages: ["verify"]},
  "RSASSA-PKCS1-v1_5private":  {usages: ["sign"]},
  "RSASSA-PKCS1-v1_5public":  {usages: ["verify"]},
  "ECDSAprivate":  {usages: ["sign", "deriveKey", "deriveBits"]},
  "ECDSApublic":  {usages: ["verify", "deriveKey", "deriveBits"]},
  "RSA-OAEPprivate": {usages: ["decrypt"]},
  "RSA-OAEPpublic": {usages: ["encrypt"]},
}

export const RDF = Namespace("http://www.w3.org/1999/02/22-rdf-syntax-ns#")
export const RDFS = Namespace("http://www.w3.org/2000/01/rdf-schema#")
export const XSD = Namespace("http://www.w3.org/2001/XMLSchema#")
export const SECRETGRAPH = Namespace("/static/schemes/secretgraph/secretgraph#");
export const CLUSTER = Namespace("/static/schemes/secretgraph/cluster#");
