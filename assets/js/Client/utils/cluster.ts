import { parse, graph, SPARQLToQuery } from 'rdflib'
import { CLUSTER, SECRETGRAPH } from '../constants'

export function extractPublicInfo(
    publicInfo: string,
    withTokens?: false
): {
    name: string | null
    note: string | null
}
export function extractPublicInfo(
    publicInfo: string,
    withTokens: true
): {
    name: string | null
    note: string | null
    publicTokens: string[]
}
export function extractPublicInfo(publicInfo: string, withTokens = false) {
    let name: string | null = null,
        note: string | null = null,
        publicTokens: string[] = []
    try {
        const store = graph()
        parse(publicInfo as string, store, '_:')
        const name_note_results = store.querySync(
            SPARQLToQuery(
                `SELECT ?name ?note WHERE {_:cluster a ${CLUSTER(
                    'Cluster'
                )}; ${SECRETGRAPH(
                    'name'
                )} ?name. OPTIONAL { _:cluster ${SECRETGRAPH(
                    'note'
                )} ?note . } }`,
                true,
                store
            )
        )
        if (name_note_results.length > 0) {
            name = name_note_results[0]['?name'].value
            note = name_note_results[0]['?note']
                ? name_note_results[0]['?note'].value
                : ''
        }
        if (withTokens) {
            publicTokens = store
                .querySync(
                    SPARQLToQuery(
                        `SELECT ?token WHERE {_:cluster a ${CLUSTER(
                            'Cluster'
                        )}; ${CLUSTER(
                            'Cluster.publicsecrets'
                        )} _:pubsecret . _:pubsecret ${CLUSTER(
                            'PublicSecret.value'
                        )} ?token . }`,
                        true,
                        store
                    )
                )
                .map((val: any) => val.token)
        }
    } catch (exc) {
        console.error('Could not parse publicInfo', exc, publicInfo)
        throw exc
    }
    return {
        name,
        note,
        publicTokens: withTokens ? publicTokens : undefined,
    }
}
