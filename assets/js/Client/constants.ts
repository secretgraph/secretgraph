import { Namespace } from "rdflib";

declare var gettext: any;

export const contentStates = new Map([
  ['default', { label: gettext('Default') }],
  ['draft', { label: gettext('Draft') }],
  ['internal', {label: gettext('Internal') }],
  ['public', { label: gettext('Public') }],
]);

export const mapHashNames: { [algo: string]: string } = {
  "sha512": "SHA-512" as const,
  "SHA-512": "SHA-512" as const,
  "sha256": "SHA-256" as const,
  "SHA-256": "SHA-256" as const
}


export const RDF = Namespace("http://www.w3.org/1999/02/22-rdf-syntax-ns#")
export const RDFS = Namespace("http://www.w3.org/2000/01/rdf-schema#")
export const XSD = Namespace("http://www.w3.org/2001/XMLSchema#")
export const SECRETGRAPH = Namespace("/static/schemes/secretgraph/secretgraph#");
export const CLUSTER = Namespace("/static/schemes/secretgraph/cluster#");
