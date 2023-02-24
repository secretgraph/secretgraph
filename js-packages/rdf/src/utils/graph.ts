import * as N3 from 'n3'
import * as RDF from 'rdf-js'

export function parseToStoreAndPrefixes(
    inp: string,
    format?: string
): [N3.Store, { [prefix: string]: RDF.NamedNode<string> }] {
    const parser = new N3.Parser({ format })
    const prefixes: { [prefix: string]: RDF.NamedNode<string> } = {}
    return [
        new N3.Store(
            parser.parse(inp, undefined, (prefix, prefixNode) => {
                prefixes[prefix] = prefixNode
            })
        ),
        prefixes,
    ]
}
export function serialize(
    store: N3.Store,
    prefixes: { [prefix: string]: RDF.NamedNode<string> },
    format: string | undefined = 'text/turtle'
): Promise<string> {
    return new Promise((resolve, reject) => {
        const writer = new N3.Writer({ format, prefixes })
        for (const quad of store) {
            writer.addQuad(quad)
        }
        writer.end((error, result) => {
            if (error) {
                reject(error)
            } else {
                resolve(result)
            }
        })
    })
}
