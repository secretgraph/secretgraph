import { gql, useLazyQuery, useQuery } from '@apollo/client'
import { Value } from '@material-ui/core'
import { clusterFeedQuery } from '@secretgraph/misc/queries/cluster'
import { extractNameNote } from '@secretgraph/misc/utils/cluster'
import { extractAuthInfo } from '@secretgraph/misc/utils/config'
import { Field, FieldProps } from 'formik'
import * as React from 'react'

import { InitializedConfig } from '../../contexts'
import SimpleSelect, { SimpleSelectProps } from './SimpleSelect'

export interface ClusterSelectProps<
    Multiple extends boolean | undefined,
    DisableClearable extends boolean | undefined,
    FreeSolo extends boolean | undefined
> extends Omit<
        SimpleSelectProps<string, Multiple, DisableClearable, FreeSolo>,
        'options' | 'getOptionLabel' | 'loading'
    > {
    url: string
    firstIfEmpty?: boolean
}

export default function ClusterSelect<
    Multiple extends boolean | undefined,
    DisableClearable extends boolean | undefined,
    FreeSolo extends boolean | undefined
>({
    url,
    firstIfEmpty,
    ...props
}: ClusterSelectProps<Multiple, DisableClearable, FreeSolo> &
    FieldProps<Value<string, Multiple, DisableClearable, FreeSolo>>) {
    const { config } = React.useContext(InitializedConfig)
    const authinfo = React.useMemo(() => {
        if (url === undefined) {
            throw Error(`no url: ${url}`)
        }
        return extractAuthInfo({
            config,
            url,
            require: new Set(['update', 'manage']),
        })
    }, [url, config])

    const { fetchMore, data, loading } = useQuery(clusterFeedQuery, {
        variables: {
            authorization: authinfo.tokens,
        },
    })
    const { ids, labelMap } = React.useMemo(() => {
        const ret: {
            ids: string[]
            labelMap: { [key: string]: { name: string; note: string } }
        } = {
            ids: [],
            labelMap: {},
        }
        if (!data) {
            return ret
        }
        for (const { node } of data.clusters.clusters.edges) {
            const { name, note } = extractNameNote(node.description)
            ret.ids.push(node.id)
            if (name) {
                ret.labelMap[node.id] = { name, note: note || '' }
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
    }, [ids.length ? ids[0] : ' '])
    return (
        <SimpleSelect
            {...props}
            loading={loading}
            getOptionLabel={(option) => {
                return labelMap[option]?.name || option
            }}
            options={ids}
        />
    )
}
