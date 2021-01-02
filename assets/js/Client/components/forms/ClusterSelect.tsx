import * as React from 'react'

import { InitializedConfigContext } from '../../contexts'
import { extractAuthInfo } from '../../utils/config'

import { gql, useQuery } from '@apollo/client'

import SimpleSelect from './SimpleSelect'

export default function ClusterSelect({ url }: { url: string }) {
    const [options, setOptions] = React.useState([] as [string, string][])
    const [open, setOpen] = React.useState(false)
    const { config } = React.useContext(InitializedConfigContext)
    const { data, fetchMore, loading } = useQuery(clusterFeedQuery, {
        variables: {
            authorization: authinfo.keys,
        },
    })
    if (loading) return null

    React.useEffect(() => {
        if (!open) {
            return
        }
        setOptions([])
        ;(async () => {
            const authinfo = extractAuthInfo({
                config,
                url,
                require: ['update', 'manage'],
            })
            const { data, fetchMore, loading } = useQuery(clusterFeedQuery, {
                variables: {
                    authorization: authinfo.keys,
                },
            })
        })()
    }, [open])
    return (
        <SimpleSelect
            name="cluster"
            options={options}
            open={open}
            onOpen={() => {
                setOpen(true)
            }}
            onClose={() => {
                setOpen(false)
            }}
        />
    )
}
