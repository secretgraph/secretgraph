import * as React from 'react'

import { InitializedConfigContext } from '../../contexts'
import { extractAuthInfo } from '../../utils/config'
import { clusterFeedQuery } from '../../queries/cluster'
import { CLUSTER, SECRETGRAPH, contentStates } from '../../constants'
import { parse, graph, SPARQLToQuery } from 'rdflib'

import { gql, useLazyQuery } from '@apollo/client'

import SimpleSelect, { SimpleSelectProps } from './SimpleSelect'

export interface ClusterSelectProps<
    Multiple extends boolean | undefined,
    DisableClearable extends boolean | undefined,
    FreeSolo extends boolean | undefined,
    V
> extends Omit<
        SimpleSelectProps<
            Multiple,
            DisableClearable,
            FreeSolo,
            V,
            { id: string; label: string }
        >,
        'options'
    > {
    url: string
}

export default function ClusterSelect<
    Multiple extends boolean | undefined,
    DisableClearable extends boolean | undefined,
    FreeSolo extends boolean | undefined,
    V
>({
    url,
    ...props
}: ClusterSelectProps<Multiple, DisableClearable, FreeSolo, V>) {
    const { config } = React.useContext(InitializedConfigContext)

    const authinfo = React.useMemo(
        () =>
            extractAuthInfo({
                config,
                url,
                require: ['update', 'manage'],
            }),
        [config, url]
    )

    const [getClusters, { fetchMore, data, called, refetch }] = useLazyQuery(
        clusterFeedQuery,
        {
            variables: {
                authorization: authinfo.keys,
            },
            onCompleted: (data) => {
                if (data.clusters.clusters.pageInfo.hasNextPage) {
                    ;(fetchMore as NonNullable<typeof fetchMore>)({
                        variables: {
                            cursor: data.clusters.clusters.pageInfo.endCursor,
                        },
                    })
                }
            },
        }
    )
    const clustersFinished: {
        id: string
        label: string
    }[] = React.useMemo(() => {
        if (!data) {
            return []
        }
        return data.clusters.clusters.edges.map((edge: any) => {
            let name: string | undefined,
                note: string = ''
            try {
                const store = graph()
                parse(edge.node.publicInfo, store, '_:')
                const results = store.querySync(
                    SPARQLToQuery(
                        `SELECT ?name ?note WHERE {_:cluster a ${CLUSTER(
                            'Cluster'
                        )}; ${SECRETGRAPH(
                            'name'
                        )} ?name. OPTIONAL { _:cluster ${SECRETGRAPH(
                            'note'
                        )} ?note . } }`,
                        false,
                        store
                    )
                )
                if (results.length > 0) {
                    name = results[0]['?name'].value
                    note = results[0]['?note'] ? results[0]['?note'].value : ''
                }
            } catch (exc) {
                console.warn('Could not parse publicInfo', exc)
            }
            return {
                id: edge.node.id,
                label: name === undefined ? edge.node.id : name,
            }
        })
    }, [data])
    return (
        <SimpleSelect
            {...props}
            options={clustersFinished}
            onOpen={() => {
                if (called) {
                    ;(refetch as NonNullable<typeof refetch>)()
                } else {
                    getClusters()
                }
            }}
        />
    )
}
