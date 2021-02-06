import * as React from 'react'
import { Theme } from '@material-ui/core/styles'
import CircularProgress from '@material-ui/core/CircularProgress'
import Typography from '@material-ui/core/Typography'

import Grid from '@material-ui/core/Grid'

import { saveAs } from 'file-saver'
import { useQuery, useApolloClient, ApolloClient } from '@apollo/client'

import { ConfigInterface } from '../interfaces'
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

    return (
        <Grid container spacing={2}>
            <Grid item xs={12}>
                <Typography variant="h5">Keywords</Typography>
                <Typography variant="body2"></Typography>
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

    return <></>
}

const AddKeys = (props: Props) => {
    const { classes, theme } = useStylesAndTheme()

    return <></>
}

async function findOrReturn({
    type,
    client,
    authorization,
    id,
}: {
    type: string
    client: ApolloClient<any>
    authorization: string[]
    id: string
}) {
    if (type == 'PublicKey') {
        return undefined
    }
    const { data } = await client.query({
        query: findPublicKeyQuery,
        variables: {
            authorization,
            id,
        },
    })
    let d = data.secretgraph.node
    if (d) {
        d = d.references
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
    const { keys: authorization } = extractAuthInfo({
        config,
        url: mainCtx.url as string,
    })
    useAsync({
        promiseFn: findOrReturn,
        onReject: console.error,
        onResolve: (data) => {
            if (data) {
                updateMainCtx({ item: data })
            } else if (data === null) {
                updateMainCtx({ item: null, action: 'add' })
            }
        },
        client,
        id: mainCtx.item as string,
        type: mainCtx.type,
        authorization,
        suspense: true,
    })
    if (mainCtx.type == 'PrivateKey') {
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
