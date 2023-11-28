import { ApolloClient, useApolloClient, useQuery } from '@apollo/client'
import FlagIcon from '@mui/icons-material/Flag'
import LockIcon from '@mui/icons-material/Lock'
import MoreIcon from '@mui/icons-material/More'
import SecurityIcon from '@mui/icons-material/Security'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import LinearProgress from '@mui/material/LinearProgress'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import Grid from '@mui/material/Unstable_Grid2'
import Box from '@mui/system/Box'
import {
    contentFeedQuery,
    contentRetrievalQuery,
    findOriginsQuery,
    getContentConfigurationQuery,
    getContentRelatedQuery,
} from '@secretgraph/graphql-queries/content'
import * as Constants from '@secretgraph/misc/constants'
import * as Interfaces from '@secretgraph/misc/interfaces'
import { UnpackPromise } from '@secretgraph/misc/typing'
import { generateActionMapper } from '@secretgraph/misc/utils/action'
import { authInfoFromConfig } from '@secretgraph/misc/utils/config'
import { findWorkingHashAlgorithms } from '@secretgraph/misc/utils/hashing'
import {
    decryptContentObject,
    updateOrCreateContentWithConfig,
} from '@secretgraph/misc/utils/operations'
import DecisionFrame from '@secretgraph/ui-components/DecisionFrame'
import StateSelect from '@secretgraph/ui-components/forms/StateSelect'
import UploadButton from '@secretgraph/ui-components/UploadButton'
import {
    FastField,
    Field,
    FieldArray,
    FieldArrayRenderProps,
    FieldProps,
    Form,
    Formik,
    useField,
} from 'formik'
import * as React from 'react'

import * as Contexts from '../../contexts'
import { InnerProfile, InnerProfileProps } from './form'

const EditProfile = ({ viewOnly }: { viewOnly?: boolean }) => {
    const { config } = React.useContext(Contexts.InitializedConfig)
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const [data, setData] = React.useState<
        | (InnerProfileProps & {
              key: string
          })
        | null
    >(null)

    let {
        data: dataUnfinished,
        loading,
        refetch,
        client,
    } = useQuery(contentRetrievalQuery, {
        fetchPolicy: 'cache-and-network',
        variables: {
            id: mainCtx.item as string,
            authorization: mainCtx.tokens,
        },
    })

    React.useEffect(() => {
        if (dataUnfinished) {
            loading = true
            refetch()
        }
    }, [mainCtx.updateId])
    React.useEffect(() => {
        if (
            dataUnfinished &&
            dataUnfinished.secretgraph.node.cluster.id != mainCtx.editCluster
        ) {
            loading = true
            refetch()
        }
    }, [mainCtx.editCluster])
    React.useEffect(() => {
        if (!dataUnfinished) {
            return
        }
        let active = true
        const f = async () => {
            const updateOb: Partial<Interfaces.MainContextInterface> = {
                //shareUrl: dataUnfinished.secretgraph.node.link,
                deleted: dataUnfinished.secretgraph.node.deleted || null,
                updateId: dataUnfinished.secretgraph.node.updateId,
                tokensPermissions: new Set([
                    ...mainCtx.tokensPermissions,
                    ...dataUnfinished.secretgraph.node.availableActions.map(
                        (val: { keyHash: string; type: string }) => val.type
                    ),
                ]),
            }
            const host = mainCtx.url ? config.hosts[mainCtx.url] : null
            const contentstuff =
                host && host.contents[dataUnfinished.secretgraph.node.id]

            const hashAlgorithms = findWorkingHashAlgorithms(
                dataUnfinished.secretgraph.config.hashAlgorithms
            )
            const mapper = await generateActionMapper({
                config,
                knownHashesCluster: [
                    dataUnfinished.secretgraph.node.cluster?.availableActions,
                    contentstuff &&
                        host?.clusters[contentstuff.cluster]?.hashes,
                ],
                knownHashesContent: [
                    dataUnfinished.secretgraph.node.availableActions,
                    contentstuff?.hashes,
                ],
                hashAlgorithms,
            })
            if (!active) {
                return
            }
            let obj
            try {
                obj = await decryptContentObject({
                    config,
                    nodeData: dataUnfinished.secretgraph.node,
                    blobOrTokens: mainCtx.tokens,
                    itemDomain: mainCtx.url || '/',
                    client,
                })
            } catch (exc) {
                if (!active) {
                    return
                }
                throw exc
            }
            if (!obj) {
                console.error('failed decoding')
                return
            }
            if (!active) {
                return
            }

            let name: string = mainCtx.item || ''
            if (obj.tags.name && obj.tags.name.length > 0) {
                name = obj.tags.name[0]
            } else if (obj.tags['~name'] && obj.tags['~name'].length > 0) {
                name = obj.tags['~name'][0]
            }
            updateOb['title'] = name
            setData({
                ...obj,
                data: JSON.parse(await new Blob([obj.data]).text()),
                key: `${new Date().getTime()}`,
                hashAlgorithm: hashAlgorithms[0],
                url: mainCtx.url as string,
                mapper: await mapper,
            })
        }
        f()
        return () => {
            active = false
        }
    }, [dataUnfinished])
    if (!data) {
        return null
    }
    return <InnerProfile {...data} disabled={loading} viewOnly={viewOnly} />
}
const CreateProfile = () => {
    const { activeUrl } = React.useContext(Contexts.ActiveUrl)
    const { config } = React.useContext(Contexts.InitializedConfig)
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const [data, setData] = React.useState<{
        key: string
        hashAlgorithm: string
        url: string
        mapper: UnpackPromise<ReturnType<typeof generateActionMapper>>
    } | null>(null)
    let {
        data: dataUnfinished,
        refetch,
        loading,
    } = useQuery(getContentConfigurationQuery, {
        fetchPolicy: 'cache-and-network',
        variables: {
            id: mainCtx.editCluster || Constants.stubCluster,
            authorization: mainCtx.tokens,
        },
        onError: console.error,
    })
    React.useEffect(() => {
        if (mainCtx.editCluster) {
            loading = true
            refetch()
        }
    }, [mainCtx.editCluster])

    React.useEffect(() => {
        if (!dataUnfinished) {
            return
        }
        let active = true
        const f = async () => {
            if (!dataUnfinished) {
                return
            }
            updateMainCtx({
                deleted: false,
                updateId: null,
            })
            const hashAlgorithms = findWorkingHashAlgorithms(
                dataUnfinished.secretgraph.config.hashAlgorithms
            )

            const host = mainCtx.url ? config.hosts[mainCtx.url] : null

            const mapper = await generateActionMapper({
                config,
                knownHashesCluster: dataUnfinished.secretgraph.node
                    ? [
                          dataUnfinished.secretgraph.node.availableActions,
                          host?.clusters[dataUnfinished.secretgraph.node.id]
                              ?.hashes,
                      ]
                    : [],
                hashAlgorithms,
            })
            if (!active) {
                return
            }
            setData({
                key: `${new Date().getTime()}`,
                hashAlgorithm: hashAlgorithms[0],
                url: activeUrl,
                mapper: mapper,
            })
        }
        f()
        return () => {
            active = false
        }
    }, [dataUnfinished])
    if (!data) {
        return null
    }
    return <InnerProfile {...data} disabled={loading} />
}
const ViewProfile = () => {
    return <EditProfile viewOnly />
}

async function findOrReturn({
    client,
    authorization,
    id,
    url,
}: {
    client: ApolloClient<any>
    id: string | null
    url: string | null
    authorization: string[]
}): Promise<[string, string | null] | null | true> {
    if (!id || !url) {
        return true
    }
    const { data } = await client.query({
        query: findOriginsQuery,
        variables: {
            authorization,
            id,
            groups: ['parent'],
        },
    })
    const node = data.secretgraph.node
    if (node.type == 'Profile') {
        return true
    }
    let d = null
    if (node) {
        d = node.references
    }
    if (d && d.edges.length) {
        return [
            d.edges[0].node.target.id,
            d.edges[0].node.target.cluster?.id || null,
        ]
    }
    return null
}

export default function ProfileComponent() {
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const { config } = React.useContext(Contexts.InitializedConfig)

    const client = useApolloClient()
    const [barrier, setBarrier] = React.useState<Promise<any> | undefined>(
        () => Promise.resolve()
    )
    React.useEffect(() => {
        let active = true
        const f = async () => {
            const result = await findOrReturn({
                client,
                id:
                    mainCtx.action === 'create'
                        ? null
                        : (mainCtx.item as string | null),
                url: mainCtx.url,
                authorization: mainCtx.tokens,
            })
            if (active) {
                if (result === true) {
                    setBarrier(undefined)
                } else if (result) {
                    let authInfo = undefined
                    if (result[1] && result[1] != mainCtx.editCluster) {
                        authInfo = authInfoFromConfig({
                            config,
                            url: mainCtx.url as string,
                            contents: new Set([result[0]]),
                            clusters: new Set([result[1]]),
                        })
                    }
                    updateMainCtx({
                        item: result[0],
                        editCluster: result[1] || undefined,
                        currentCluster: result[1] || undefined,
                        type: 'PublicKey',
                        tokens: authInfo?.tokens || undefined,
                        tokensPermissions: authInfo?.types || undefined,
                    })
                } else {
                    updateMainCtx({
                        item: null,
                        type: 'PublicKey',
                        action: 'create',
                    })
                }
            }
        }
        setBarrier(f())
        return () => {
            active = false
            setBarrier(Promise.resolve())
        }
    }, [mainCtx.url, mainCtx.item])
    return (
        <DecisionFrame
            mainCtx={mainCtx}
            updateMainCtx={updateMainCtx}
            create={CreateProfile}
            view={ViewProfile}
            edit={EditProfile}
        />
    )
}
