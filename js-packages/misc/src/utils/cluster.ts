import { SPARQLToQuery, graph, parse } from 'rdflib'

import { CLUSTER, SECRETGRAPH } from '../constants'

export function extractNameNote(description: string): {
    name: string
    note: string | null
} {
    let name: string,
        note: string | null = null
    if (description.includes('\u001F')) {
        const split = description.split('\u001F')
        name = split[0]
        note = split[1]
    } else {
        name = description
    }
    return {
        name,
        note,
        //publicTokens: withTokens ? publicTokens : undefined,
    }
}
