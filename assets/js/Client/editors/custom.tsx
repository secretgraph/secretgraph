import { useApolloClient, useQuery } from '@apollo/client'
import Button from '@material-ui/core/Button'
import Checkbox from '@material-ui/core/Checkbox'
import FormControlLabel from '@material-ui/core/FormControlLabel'
import Grid from '@material-ui/core/Grid'
import LinearProgress from '@material-ui/core/LinearProgress'
import { Theme } from '@material-ui/core/styles'
import TextField, { TextFieldProps } from '@material-ui/core/TextField'
import Tooltip from '@material-ui/core/Tooltip'
import Typography from '@material-ui/core/Typography'
import CloudDownloadIcon from '@material-ui/icons/CloudDownload'
import Autocomplete from '@material-ui/lab/Autocomplete'
import {
    FastField,
    Field,
    FieldProps,
    Form,
    Formik,
    useFormikContext,
} from 'formik'
import * as React from 'react'

import FormikTextField from '../components/formik/FormikTextField'
import ClusterSelect from '../components/forms/ClusterSelect'
import SimpleSelect from '../components/forms/SimpleSelect'
import * as Contexts from '../contexts'
import { newClusterLabel } from '../messages'
import {
    contentRetrievalQuery,
    getContentConfigurationQuery,
} from '../queries/content'
import { useStylesAndTheme } from '../theme'
import { extractAuthInfo } from '../utils/config'
import { extractPrivKeys } from '../utils/config'
import { serializeToBase64 } from '../utils/encryption'
import { extractPubKeysCluster } from '../utils/graphql'
import {
    createContent,
    decryptContentObject,
    updateContent,
} from '../utils/operations'
import { UnpackPromise } from '../utils/typing'

type Props = {}

const InnerCustom = ({
    encryptedTags,
    setEncryptedTags,
    disabled,
    viewOnly,
    url,
}: {
    encryptedTags: string[]
    setEncryptedTags: (arg: string[]) => void
    disabled?: boolean
    viewOnly?: boolean
    url: string
}) => {
    const { classes, theme } = useStylesAndTheme()
    const { isSubmitting, dirty, submitForm } = useFormikContext()
    return (
        <Form>
            <Grid container spacing={2}>
                <Grid item xs={12}>
                    <Typography>Active Url</Typography>
                    <Typography>{url}</Typography>
                </Grid>
                <Grid item xs={12} md={4}>
                    <FastField
                        component={SimpleSelect}
                        name="tags"
                        disabled={disabled || isSubmitting}
                        options={[]}
                        label="Tags"
                        freeSolo
                        multiple
                    />
                </Grid>
                <Grid item xs={12} md={4}>
                    <FastField
                        component={ClusterSelect}
                        url={url}
                        name="cluster"
                        disabled={disabled || isSubmitting}
                        label="Cluster"
                        firstIfEmpty
                        validate={(val: string) => {
                            if (!val) {
                                return 'empty'
                            }
                            return null
                        }}
                    />
                </Grid>
                <Grid item xs={12} md={4}>
                    <Autocomplete
                        multiple
                        options={encryptedTags}
                        renderInput={(params) => {
                            return (
                                <TextField
                                    {...params}
                                    label="Encrypted Tagprefixes"
                                    fullWidth
                                    disabled={disabled || isSubmitting}
                                    variant="outlined"
                                    helperText="Prefixes of the tags which should be encrypted (e.g. ename=, mime=)"
                                />
                            )
                        }}
                        onChange={(ev, val) => {
                            setEncryptedTags(val)
                        }}
                    />
                </Grid>
                <Grid item xs={12}>
                    <FastField
                        component={FormikTextField}
                        name="content"
                        disabled={disabled || isSubmitting}
                        label="Content"
                        multiline
                        fullWidth
                        variant="outlined"
                    />
                </Grid>
                <Grid item xs={12}>
                    {isSubmitting && <LinearProgress />}
                </Grid>
                {!viewOnly && (
                    <Grid item xs={12}>
                        <Button
                            variant="contained"
                            color="primary"
                            disabled={disabled || isSubmitting || !dirty}
                            onClick={submitForm}
                        >
                            Submit
                        </Button>
                    </Grid>
                )}
            </Grid>
        </Form>
    )
}

const EditCustom = ({
    viewOnly,
    disabled,
}: {
    viewOnly?: boolean
    disabled?: boolean
}) => {
    const { classes, theme } = useStylesAndTheme()
    const client = useApolloClient()
    const { config } = React.useContext(Contexts.InitializedConfig)
    const { mainCtx } = React.useContext(Contexts.Main)
    const [data, setData] =
        React.useState<
            | (Exclude<
                  UnpackPromise<ReturnType<typeof decryptContentObject>>,
                  null
              > & {
                  text: string
              })
            | null
        >(null)
    const [encryptedTags, setEncryptedTags] = React.useState<string[]>([
        'ename',
        'mime',
    ])
    const authinfo = React.useMemo(
        () =>
            extractAuthInfo({
                config,
                url: mainCtx.url as string,
            }),
        [mainCtx.url, config]
    )
    const {
        data: dataUnfinished,
        loading,
        refetch,
    } = useQuery(contentRetrievalQuery, {
        pollInterval: 60000,
        fetchPolicy: 'cache-and-network',
        variables: {
            variables: {
                id: mainCtx.item as string,
                authorization: authinfo.tokens,
            },
        },
    })
    React.useEffect(() => {
        if (!dataUnfinished) {
            return
        }
        decryptContentObject({
            config,
            nodeData: dataUnfinished.secretgraph.node,
            blobOrTokens: authinfo.tokens,
            decrypt: new Set(encryptedTags),
        }).then(async (res) => {
            res && setData({ ...res, text: await new Blob([res.data]).text() })
        })
    }, [dataUnfinished, ...encryptedTags])
    if (!data) {
        return null
    }
    const initialValues = {
        tags: [] as string[],
        content: data.text,
        cluster: data.nodeData.cluster.id,
    }
    for (const [prefix, vals] of Object.entries(data.tags)) {
        if (vals.length) {
            for (const tag of vals) {
                initialValues.tags.push(`${prefix}=${tag}`)
            }
        } else {
            initialValues.tags.push(prefix)
        }
    }
    return (
        <Formik
            initialValues={initialValues}
            onSubmit={async (values) => {
                const value: Blob = new Blob([values.content])
                const authinfo = extractAuthInfo({
                    config,
                    clusters: new Set([
                        values.cluster,
                        data.nodeData.cluster.id,
                    ]),
                    url: mainCtx.url as string,
                    require: new Set(['update']),
                })
                const pubkeysResult = await client.query({
                    fetchPolicy: 'network-only',
                    query: getContentConfigurationQuery,
                    variables: {
                        authorization: authinfo.tokens,
                        id: mainCtx.item,
                    },
                })
                const hashAlgorithm =
                    config.hosts[mainCtx.url as string].hashAlgorithms[0]
                //await client.query({                          query: serverConfigQuery,                      })) as any).data.secretgraph.config.hashAlgorithms[0]
                const privkeys = extractPrivKeys({
                    config,
                    url: mainCtx.url as string,
                    hashAlgorithm,
                })
                const pubkeys = extractPubKeysCluster({
                    node: pubkeysResult.data.secretgraph.node.cluster,
                    authorization: authinfo.tokens,
                    params: {
                        name: 'RSA-OAEP',
                        hash: hashAlgorithm,
                    },
                })
                const result = await updateContent({
                    id: mainCtx.item as string,
                    updateId: data.nodeData.updateId,
                    client,
                    config,
                    cluster: values.cluster, // can be null for keeping cluster
                    value,
                    tags: values.tags,
                    encryptTags: new Set(encryptedTags),
                    privkeys: await Promise.all(Object.values(privkeys)),
                    pubkeys: Object.values(pubkeys),
                    hashAlgorithm,
                    authorization: authinfo.tokens,
                })
                if (result.errors) {
                    console.error(result.errors)
                } else if (!result.data.updateOrCreateContent.writeok) {
                    console.log(
                        'Write failed because of update, load new version',
                        result
                    )
                }
                refetch()
            }}
        >
            {() => (
                <InnerCustom
                    url={mainCtx.url as string}
                    encryptedTags={encryptedTags}
                    setEncryptedTags={setEncryptedTags}
                    viewOnly={viewOnly}
                    disabled={disabled}
                />
            )}
        </Formik>
    )
}
const AddCustom = () => {
    const { classes, theme } = useStylesAndTheme()
    const client = useApolloClient()
    const { activeUrl } = React.useContext(Contexts.ActiveUrl)
    const { config } = React.useContext(Contexts.InitializedConfig)
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const { searchCtx } = React.useContext(Contexts.Search)
    const [encryptedTags, setEncryptedTags] = React.useState<string[]>([
        'ename',
        'mime',
    ])

    const initialValues = {
        tags: [] as string[],
        content: '',
        cluster: searchCtx.cluster,
    }
    return (
        <Formik
            initialValues={initialValues}
            onSubmit={async (values, { setSubmitting }) => {
                const value: Blob = new Blob([values.content])
                const authinfo = extractAuthInfo({
                    config,
                    clusters: new Set([values.cluster as string]),
                    url: mainCtx.url as string,
                    require: new Set(['create']),
                })
                const pubkeysResult = await client.query({
                    fetchPolicy: 'network-only',
                    query: getContentConfigurationQuery,
                    variables: {
                        authorization: authinfo.tokens,
                        id: values.cluster,
                    },
                })
                const hashAlgorithm =
                    config.hosts[mainCtx.url as string].hashAlgorithms[0]
                //await client.query({                          query: serverConfigQuery,                      })) as any).data.secretgraph.config.hashAlgorithms[0]
                const privkeys = extractPrivKeys({
                    config,
                    url: mainCtx.url as string,
                    hashAlgorithm,
                })
                const pubkeys = extractPubKeysCluster({
                    node: pubkeysResult.data.secretgraph.node.cluster,
                    authorization: authinfo.tokens,
                    params: {
                        name: 'RSA-OAEP',
                        hash: hashAlgorithm,
                    },
                })
                try {
                    const result = await createContent({
                        client,
                        config,
                        cluster: values.cluster as string,
                        value,
                        tags: values.tags,
                        encryptTags: new Set(encryptedTags),
                        privkeys: await Promise.all(Object.values(privkeys)),
                        pubkeys: Object.values(pubkeys),
                        hashAlgorithm,
                        authorization: authinfo.tokens,
                    })
                    if (result.errors) {
                        console.error(result.errors)
                    }
                    updateMainCtx({
                        item: result.data.updateOrCreateContent.content.id,
                        updateId:
                            result.data.updateOrCreateContent.content.updateId,
                        url: activeUrl,
                        action: 'update',
                    })
                } catch (exc) {
                    console.error(exc)
                    setSubmitting(false)
                }
            }}
        >
            {() => (
                <InnerCustom
                    url={activeUrl}
                    encryptedTags={encryptedTags}
                    setEncryptedTags={setEncryptedTags}
                />
            )}
        </Formik>
    )
}
const ViewCustom = () => {
    const { classes, theme } = useStylesAndTheme()
    // list all tags
    // view content if possible
    // elsewise just download

    return <EditCustom viewOnly disabled />
}

export default function CustomComponent(props: Props) {
    const { mainCtx } = React.useContext(Contexts.Main)
    if (mainCtx.action == 'view' && mainCtx.item) {
        return <ViewCustom />
    } else if (mainCtx.action == 'update' && mainCtx.item) {
        return <EditCustom />
    } else if (mainCtx.action == 'add') {
        return <AddCustom />
    }
    return null
}
