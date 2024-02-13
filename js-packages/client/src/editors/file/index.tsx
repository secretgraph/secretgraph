import { useQuery } from '@apollo/client'
import {
    contentRetrievalQuery,
    getContentConfigurationQuery,
} from '@secretgraph/graphql-queries/content'
import * as Constants from '@secretgraph/misc/constants'
import * as Interfaces from '@secretgraph/misc/interfaces'
import { UnpackPromise } from '@secretgraph/misc/typing'
import { generateActionMapper } from '@secretgraph/misc/utils/action'
import { findWorkingAlgorithms } from '@secretgraph/misc/utils/crypto'
import { decryptContentObject } from '@secretgraph/misc/utils/operations'
import DecisionFrame from '@secretgraph/ui-components/DecisionFrame'
import * as React from 'react'

import * as Contexts from '../../contexts'
import { InnerFile } from './form'

const EditFile = ({ viewOnly = false }: { viewOnly?: boolean }) => {
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const { config } = React.useContext(Contexts.InitializedConfig)
    const [data, setData] = React.useState<{
        mapper: UnpackPromise<ReturnType<typeof generateActionMapper>>
        hashAlgorithms: string[]
        nodeData: any
        tags: { [name: string]: string[] }
        data: Blob | null
        key: string | number
    } | null>(null)

    let {
        data: dataUnfinished,
        refetch,
        loading,
        client,
    } = useQuery(contentRetrievalQuery, {
        fetchPolicy: 'cache-and-network',
        nextFetchPolicy: 'network-only',
        variables: {
            id: mainCtx.item as string,
            authorization: mainCtx.tokens,
            includeTags: ['name=', '~name=', 'mime='],
        },
        onError: console.error,
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
        if (!dataUnfinished || loading) {
            return
        }
        if (!dataUnfinished.secretgraph.node) {
            console.log('empty node, permissions?')
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
                readonly:
                    dataUnfinished.secretgraph.node.tags.includes('immutable'),
                shareFn: () => updateMainCtx({ openDialog: 'share' }),
            }
            const host = mainCtx.url ? config.hosts[mainCtx.url] : null
            const contentstuff =
                host && host.contents[dataUnfinished.secretgraph.node.id]

            const hashAlgorithms = findWorkingAlgorithms(
                dataUnfinished.secretgraph.config.hashAlgorithms,
                'hash'
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

            let obj = undefined
            try {
                obj = await decryptContentObject({
                    config,
                    nodeData: dataUnfinished.secretgraph.node,
                    blobOrTokens: mainCtx.tokens,
                    itemDomain: mainCtx.url || '/',
                    transferClient: client,
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

            let name: string = mainCtx.item || ''

            if (obj.tags.name && obj.tags.name.length > 0) {
                name = obj.tags.name[0]
            } else if (obj.tags['~name'] && obj.tags['~name'].length > 0) {
                name = obj.tags['~name'][0]
            }
            updateOb['title'] = name
            updateMainCtx(updateOb)
            setData({
                ...obj,
                hashAlgorithms,
                mapper,
                data: new Blob([obj.data], {
                    type:
                        (obj.tags?.mime ? obj.tags.mime[0] : undefined) ??
                        'application/octet-stream',
                }),
                key: `${new Date().getTime()}`,
            })
        }
        f()
        return () => {
            active = false
        }
    }, [dataUnfinished, config])

    if (!data) {
        return null
    }
    return (
        <InnerFile
            {...data}
            url={mainCtx.url as string}
            disabled={loading || viewOnly}
            viewOnly={viewOnly}
        />
    )
}

const ViewFile = () => {
    return <EditFile viewOnly />
}

const CreateFile = () => {
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const { activeUrl } = React.useContext(Contexts.ActiveUrl)
    const { config } = React.useContext(Contexts.InitializedConfig)
    const [data, setData] = React.useState<{
        mapper: UnpackPromise<ReturnType<typeof generateActionMapper>>
        hashAlgorithms: string[]
        data?: Blob | null
        key: string | number
    } | null>(null)
    // const [PSelections, setPSelections] = React.useState<string[]>([])
    const { data: dataUnfinished, refetch } = useQuery(
        getContentConfigurationQuery,
        {
            fetchPolicy: 'cache-and-network',
            variables: {
                id: mainCtx.editCluster || Constants.stubCluster,
                authorization: mainCtx.tokens,
            },
            onError: console.error,
        }
    )

    React.useEffect(() => {
        if (dataUnfinished) {
            refetch()
        }
    }, [mainCtx.editCluster, activeUrl])

    React.useEffect(() => {
        let active = true
        const f = async () => {
            if (!dataUnfinished) {
                return
            }
            const hashAlgorithms = findWorkingAlgorithms(
                dataUnfinished.secretgraph.config.hashAlgorithms,
                'hash'
            )
            const updateOb = {
                //shareUrl: null,
                deleted: null,
                updateId: null,
            }
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
            if (active) {
                updateMainCtx(updateOb)
                setData({
                    hashAlgorithms,
                    mapper,
                    key: `${new Date().getTime()}`,
                })
            }
        }
        f()
        return () => {
            active = false
        }
    }, [config, dataUnfinished])
    if (!data) {
        return null
    }

    return <InnerFile url={activeUrl} {...data} />
}

export default function FileComponent() {
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    return (
        <DecisionFrame
            mainCtx={mainCtx}
            updateMainCtx={updateMainCtx}
            create={CreateFile}
            view={ViewFile}
            edit={EditFile}
        />
    )
}
