import * as React from 'react'
import { parse, graph, SPARQLToQuery } from 'rdflib'

import { gql, useLazyQuery, useQuery } from '@apollo/client'
import { FieldProps, Field } from 'formik'

import { InitializedConfigContext } from '../../contexts'
import { extractAuthInfo } from '../../utils/config'
import { clusterFeedQuery } from '../../queries/cluster'
import { CLUSTER, SECRETGRAPH, contentStates } from '../../constants'

import SimpleSelect, { SimpleSelectProps } from './SimpleSelect'

export interface ClusterSelectProps<
    Multiple extends boolean | undefined,
    DisableClearable extends boolean | undefined,
    FreeSolo extends boolean | undefined
> extends Omit<
        SimpleSelectProps<Multiple, DisableClearable, FreeSolo, string>,
        'options'
    > {
    url: string
    firstIfEmpty?: boolean
}

export default function ClusterSelect<
    Multiple extends boolean | undefined,
    DisableClearable extends boolean | undefined,
    FreeSolo extends boolean | undefined,
    V
>({
    url,
    firstIfEmpty,
    ...props
}: ClusterSelectProps<Multiple, DisableClearable, FreeSolo> & FieldProps<V>) {
    const { config } = React.useContext(InitializedConfigContext)

    const authinfo = React.useMemo(() => {
        if (url === undefined) {
            throw Error(`no url: ${url}`)
        }
        return extractAuthInfo({
            config,
            url,
            require: new Set(['update', 'manage']),
        })
    }, [config, url])

    const { fetchMore, data, loading } = useQuery(clusterFeedQuery, {
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
    })
    const { ids, labelMap } = React.useMemo(() => {
        const ret: {
            ids: string[]
            labelMap: { [key: string]: string }
        } = {
            ids: [],
            labelMap: {},
        }
        if (!data) {
            return ret
        }
        for (const { node } of data.clusters.clusters.edges) {
            let name: string | undefined,
                note: string = ''
            try {
                const store = graph()
                parse(node.publicInfo, store, '_:')
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
            ret.ids.push(node.id)
            if (name) {
                ret.labelMap[node.id] = name
            }
        }
        return ret
    }, [data])
    React.useEffect(() => {
        if (
            !firstIfEmpty ||
            ids.length == 0 ||
            props.form.values[props.field.name]
        ) {
            return
        }
        props.form.setFieldValue(props.field.name, ids[0])
    }, [ids])
    return (
        <SimpleSelect
            {...props}
            loading={loading}
            getOptionLabel={(option) => {
                return labelMap[option] || option
            }}
            options={ids}
        />
    )
}
