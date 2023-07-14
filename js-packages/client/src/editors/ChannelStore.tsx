import { useQuery } from '@apollo/client'
import CloudDownloadIcon from '@mui/icons-material/CloudDownload'
import Security from '@mui/icons-material/Security'
import TabContext from '@mui/lab/TabContext'
import TabList from '@mui/lab/TabList'
import TabPanel from '@mui/lab/TabPanel'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import LinearProgress from '@mui/material/LinearProgress'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import TextField, { TextFieldProps } from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import Grid from '@mui/material/Unstable_Grid2'
import Box from '@mui/system/Box'
import {
    contentRetrievalQuery,
    getContentConfigurationQuery,
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
import { extractGroupKeys } from '@secretgraph/misc/utils/references'
import { parseToStoreAndPrefixes } from '@secretgraph/rdf/utils/graph'
import DecisionFrame from '@secretgraph/ui-components/DecisionFrame'
import SimpleSelect from '@secretgraph/ui-components/forms/SimpleSelect'
import StateSelect from '@secretgraph/ui-components/forms/StateSelect'
import SunEditor from '@secretgraph/ui-components/SunEditor'
import UploadButton from '@secretgraph/ui-components/UploadButton'
import * as DOMPurify from 'dompurify'
import { FastField, Field, FieldProps, Form, Formik } from 'formik'
import * as React from 'react'

import FormikCheckboxWithLabel from '../../../ui-components/src/formik/FormikCheckboxWithLabel'
import FormikTextField from '../../../ui-components/src/formik/FormikTextField'
import * as Contexts from '../contexts'
import { mapperToArray } from '../hooks'

const rdfMimes = new Set(['text/turtle', 'application/trig', 'text/n3'])
function jsonToNodes(currentElement: Array<any> | Object) {
    if (currentElement instanceof Array) {
        const ret: React.ReactNode[] = []
        for (const el of currentElement) {
            ret.push(jsonToNodes(el))
        }
        return <>{...ret}</>
    } else if (currentElement instanceof Object) {
        const ret: React.ReactNode[] = []
        for (const tuple of Object.entries(currentElement)) {
            ret.push(
                <Stack direction="row" spacing={2} key={tuple[0]}>
                    <Typography>{tuple[0]}</Typography>
                    {jsonToNodes(tuple[1])}
                </Stack>
            )
        }
    } else {
        return <Typography variant="body2">{`${currentElement}`}</Typography>
    }
}

function JSONView({ data }: { data: Blob }) {
    const [struct, setStruct] = React.useState<React.ReactNode>(null)
    React.useEffect(() => {
        let active = true
        async function f() {
            const jsonOb = JSON.parse(await data.text())
            setStruct(jsonToNodes(jsonOb))
        }
        f()
        return () => {
            active = false
        }
    }, [data])
    return <>{struct}</>
}

function RDFTripleView({ data, mime }: { data: Blob; mime: string }) {
    const [struct, setStruct] = React.useState<React.ReactNode>(null)
    React.useEffect(() => {
        let active = true
        async function f() {
            let store,
                prefixes,
                text = await data.text()
            try {
                const res = parseToStoreAndPrefixes(text, mime)
                store = res[0]
                prefixes = res[1]
            } catch (exc) {
                console.warn('Missmatch mime type format', exc)
                const res = parseToStoreAndPrefixes(text)
                store = res[0]
                prefixes = res[1]
            }

            const prefixNodes: React.ReactNode[] = Object.entries(
                prefixes
            ).map(([key, val]) => {
                return (
                    <Stack direction="row" spacing={2}>
                        <Typography>{key}</Typography>
                        <Typography>{val.value}</Typography>
                    </Stack>
                )
            })
            const quadsNodes: React.ReactNode[] = []
            for (const quad of store) {
                quadsNodes.push(
                    <Stack direction="row" spacing={1}>
                        <Typography>{quad.subject.value}</Typography>
                        <Typography>{quad.predicate.value}</Typography>
                        <Typography>{quad.object.value}</Typography>
                    </Stack>
                )
            }
            setStruct(
                <Stack spacing={2}>
                    <div>
                        <Typography variant="h2">Prefixes</Typography>
                        <Box sx={{ paddingLeft: (theme) => theme.spacing(2) }}>
                            {...prefixNodes}
                        </Box>
                    </div>
                    <div>
                        <Typography variant="h2">Triple</Typography>
                        <Box sx={{ paddingLeft: (theme) => theme.spacing(2) }}>
                            {...quadsNodes}
                        </Box>
                    </div>
                </Stack>
            )
        }
        f()
        return () => {
            active = false
        }
    }, [data])
    return <>{struct}</>
}

function CustomView({ data }: { data: Blob }) {
    const [text, setText] = React.useState<string>()
    React.useEffect(() => {
        let active = true
        async function f() {
            try {
                const text = await data.text()
                if (active) {
                    setText(text)
                }
            } catch (exc) {
                const buffer = await data.arrayBuffer()
                if (active) {
                    setText(Buffer.from(buffer).toString('hex'))
                }
            }
        }
        f()
        return () => {
            active = false
        }
    }, [data])
    return (
        <>
            <Typography variant="h2">Stored data</Typography>
            <Typography variant="body1">{text}</Typography>
        </>
    )
}

function ViewChannelStore() {
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const { config } = React.useContext(Contexts.InitializedConfig)
    const [data, setData] = React.useState<{
        mapper: UnpackPromise<ReturnType<typeof generateActionMapper>>
        hashAlgorithms: string[]
        nodeData: any
        tags: { [name: string]: string[] }
        data: Blob
        key: string | number
    } | null>(null)

    let {
        data: dataUnfinished,
        refetch,
        loading,
    } = useQuery(contentRetrievalQuery, {
        fetchPolicy: 'cache-and-network',
        nextFetchPolicy: 'network-only',
        variables: {
            id: mainCtx.item as string,
            authorization: mainCtx.tokens,
            includeTags: ['name=', '~name=', '~mime='],
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
            dataUnfinished.secretgraph.node.current.id != mainCtx.editCluster
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
        if (!mainCtx.editCluster && !mainCtx.editCluster) {
            if (!dataUnfinished.secretgraph.node.cluster.id) {
                throw Error('no cluster found')
            }
            updateMainCtx({
                currentCluster: dataUnfinished.secretgraph.node.cluster.id,
                editCluster: dataUnfinished.secretgraph.node.cluster.id,
            })
        }
        loading = true
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
            loading = false
        }
        f()
        return () => {
            active = false
        }
    }, [dataUnfinished, config])

    if (!data) {
        return null
    }
    if (data.tags['~mime'][0] == 'application/json') {
        return <JSONView data={data.data} />
    } else if (rdfMimes.has(data.tags['~mime'][0])) {
        return <RDFTripleView data={data.data} mime={data.tags['~mime'][0]} />
    } else {
        return <CustomView data={data.data} />
    }
    //return <InnerFile {...data} url={mainCtx.url as string} />
}

function CreateChannelStore() {
    return null
}

export default function ChannelStoreComponent() {
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    return (
        <DecisionFrame
            mainCtx={mainCtx}
            updateMainCtx={updateMainCtx}
            create={CreateChannelStore}
            view={ViewChannelStore}
            edit={ViewChannelStore}
        />
    )
}
