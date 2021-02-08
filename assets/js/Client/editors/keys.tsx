import * as React from 'react'
import { Theme } from '@material-ui/core/styles'
import CircularProgress from '@material-ui/core/CircularProgress'
import Typography from '@material-ui/core/Typography'

import Grid from '@material-ui/core/Grid'

import { saveAs } from 'file-saver'
import { useQuery, useApolloClient, ApolloClient } from '@apollo/client'

import { ConfigInterface, MainContextInterface } from '../interfaces'
import * as Constants from '../constants'
import { MainContext, InitializedConfigContext } from '../contexts'
import { decryptContentId, decryptContentObject } from '../utils/operations'
import { extractTags, extractUnencryptedTags } from '../utils/encryption'
import { extractAuthInfo } from '../utils/config'
import DecisionFrame from '../components/DecisionFrame'

import { keysRetrievalQuery, findPublicKeyQuery } from '../queries/content'
import { useStylesAndTheme } from '../theme'
import { newClusterLabel } from '../messages'
import { useAsync } from 'react-async'

type Props = {}

async function loadKeys({
    client,
    id,
    config,
    url,
}: {
    client: ApolloClient<any>
    id: string
    config: ConfigInterface
    url: string
}) {
    const { hashes, keys: authorization } = extractAuthInfo({
        config,
        url,
    })
    const { data } = await client.query({
        query: keysRetrievalQuery,
        variables: {
            id,
            authorization,
        },
    })
    const requests = []
    const results = {} as {
        publicKey: {
            tags: { [key: string]: string[] }
            data: ArrayBuffer
            nodeData: any
        }
        privateKey?: {
            tags: { [key: string]: string[] }
            data: ArrayBuffer
            nodeData: any
        }
    }
    requests.push(
        fetch(data.secretgraph.node.link, {
            headers: {
                Authorization: authorization.join(','),
            },
        }).then(async (val) => {
            results['publicKey'] = {
                tags: await extractUnencryptedTags({
                    tags: data.secretgraph.node.tags,
                }),
                data: await val.arrayBuffer(),
                nodeData: data.secretgraph.node,
            }
        })
    )
    if (
        data.secretgraph.node.referencedBy &&
        data.secretgraph.node.referencedBy.edges.length > 0
    ) {
        const nodeData = data.secretgraph.node.referencedBy.edges[0].node
        requests.push(
            decryptContentObject({
                config,
                nodeData,
                blobOrTokens: authorization,
            }).then((val) => {
                if (!val) {
                    return
                }
                results['privateKey'] = {
                    data: val.data,
                    tags: val.tags,
                    nodeData: val.nodeData,
                }
            })
        )
    }
    await Promise.allSettled(requests)
    return results
}

const ViewKeys = (props: Props) => {
    const { classes, theme } = useStylesAndTheme()
    const client = useApolloClient()
    const { mainCtx, updateMainCtx } = React.useContext(MainContext)
    const { config } = React.useContext(InitializedConfigContext)
    const { data, isLoading } = useAsync({
        promiseFn: loadKeys,
        onReject: console.error,
        onResolve: ({ publicKey, privateKey }) => {
            if (!data) {
                return
            }
            const updateOb: Partial<MainContextInterface> = {
                deleted: publicKey.nodeData.deleted,
            }
            if (publicKey.tags.key_hash && publicKey.tags.key_hash.length > 0) {
                updateOb['title'] = publicKey.tags.key_hash[0]
            }
            if (
                publicKey.tags.state &&
                publicKey.tags.state.length > 0 &&
                Constants.contentStates.has(publicKey.tags.state[0])
            ) {
                updateOb['state'] = publicKey.tags.state[0] as any
            }
            updateMainCtx(updateOb)
        },
        suspense: true,
        id: mainCtx.item as string,
        config,
        client,
        url: mainCtx.url as string,
        watch: (mainCtx.url as string) + mainCtx.item + '' + mainCtx.deleted,
    })
    if (!data || isLoading) {
        return null
    }

    return (
        <Grid container spacing={2}>
            <Grid item xs={12}>
                <Typography variant="h5">Key hashes</Typography>
                <Typography variant="body2">
                    {data.publicKey.tags.key_hash.join(', ')}
                </Typography>
            </Grid>
            <Grid item xs={12}>
                <Typography variant="h5">Public Key</Typography>
                <Typography variant="body2">
                    {btoa(
                        String.fromCharCode(
                            ...new Uint8Array(data.publicKey.data)
                        )
                    )}
                </Typography>
            </Grid>
            <Grid item xs={12}>
                <Typography variant="h5">Private Key</Typography>
                <Typography variant="body2">
                    {data.privateKey
                        ? btoa(
                              String.fromCharCode(
                                  ...new Uint8Array(data.privateKey.data)
                              )
                          )
                        : '-'}
                </Typography>
            </Grid>
        </Grid>
    )
}
const EditKeys = (props: Props) => {
    const { classes, theme } = useStylesAndTheme()
    const { mainCtx } = React.useContext(MainContext)
    const client = useApolloClient()
    const { config } = React.useContext(InitializedConfigContext)
    const { data, isLoading } = useAsync({
        promiseFn: loadKeys,
        suspense: true,
        onReject: console.error,
        id: mainCtx.item as string,
        config,
        client,
        url: mainCtx.url as string,
    })
    if (!data || isLoading) {
        return null
    }

    return <></>
}

const AddKeys = (props: Props) => {
    const { classes, theme } = useStylesAndTheme()

    return <></>
}

async function findOrReturn({
    client,
    config,
    id,
    url,
}: {
    client: ApolloClient<any>
    config: ConfigInterface
    id: string | null
    url: string | null
}) {
    if (!id || !url) {
        return true
    }
    const { keys: authorization } = extractAuthInfo({
        config,
        url,
    })
    const { data } = await client.query({
        query: findPublicKeyQuery,
        variables: {
            authorization,
            id,
        },
    })
    const node = data.secretgraph.node
    if (node.tags.includes('type=PublicKey')) {
        return true
    }
    let d = null
    if (node) {
        d = node.references
    }
    if (d && d.edges.length) {
        return d.edges[0].node.id
    }
    return null
}

export default function KeyComponent(props: Props) {
    const { mainCtx, updateMainCtx } = React.useContext(MainContext)
    const { config } = React.useContext(InitializedConfigContext)
    const client = useApolloClient()
    const { data, isLoading } = useAsync({
        promiseFn: findOrReturn,
        onReject: console.error,
        onResolve: (data) => {
            if (data === true) {
            } else if (data) {
                updateMainCtx({ item: data, type: 'PublicKey' })
            } else {
                updateMainCtx({ item: null, type: 'PublicKey', action: 'add' })
            }
        },
        suspense: true,
        client,
        id: mainCtx.action === 'add' ? null : (mainCtx.item as string | null),
        config,
        url: mainCtx.url,
    })
    if (isLoading) {
        return null
    }
    if (data !== true) {
        return null
    }
    return (
        <DecisionFrame
            mainCtx={mainCtx}
            view={ViewKeys}
            edit={EditKeys}
            add={AddKeys}
        />
    )
}
