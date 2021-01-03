import * as React from 'react'
import CloudDownloadIcon from '@material-ui/icons/CloudDownload'
import Card from '@material-ui/core/Card'
import CardContent from '@material-ui/core/CardContent'
import { Autocomplete as FormikAutocomplete } from 'formik-material-ui-lab'
import LinearProgress from '@material-ui/core/LinearProgress'
import SunEditor from 'suneditor-react'
import * as DOMPurify from 'dompurify'
import Button from '@material-ui/core/Button'
import Typography from '@material-ui/core/Typography'

import Grid from '@material-ui/core/Grid'
import { useAsync } from 'react-async'

import { Formik, FieldProps, Form, FastField, Field } from 'formik'

import {
    TextField as FormikTextField,
    SimpleFileUpload as FormikSimpleFileUpload,
} from 'formik-material-ui'
import { useApolloClient, ApolloClient, FetchResult } from '@apollo/client'

import { ConfigInterface, MainContextInterface } from '../interfaces'
import {
    MainContext,
    InitializedConfigContext,
    SearchContext,
} from '../contexts'
import {
    decryptContentId,
    createContent,
    updateContent,
} from '../utils/operations'

import { contentQuery } from '../queries/content'
import { useStylesAndTheme } from '../theme'
import { newClusterLabel } from '../messages'
import UploadButton from '../components/UploadButton'
import SimpleSelect from '../components/forms/SimpleSelect'
import ClusterSelect from '../components/forms/ClusterSelect'
import DecisionFrame from '../components/DecisionFrame'

const ViewFile = () => {
    const { classes, theme } = useStylesAndTheme()
    const { mainCtx } = React.useContext(MainContext)
    const { config } = React.useContext(InitializedConfigContext)
    const [blobUrl, setBlobUrl] = React.useState<string | undefined>(undefined)
    const client = useApolloClient()

    //
    const { data, error } = useAsync({
        promiseFn: decryptContentId,
        suspense: true,
        client: client,
        config: config as ConfigInterface,
        url: mainCtx.url as string,
        id: mainCtx.item as string,
        decryptTags: ['mime', 'name'],
    })
    if (error) {
        console.error(error)
    }
    const mime =
        data && data.tags.mime && data.tags.mime.length > 0
            ? data.tags.mime[0]
            : 'application/octet-stream'
    React.useEffect(() => {
        if (!data) {
            return
        }
        const _blobUrl = URL.createObjectURL(
            new Blob([data.data], { type: mime })
        )
        setBlobUrl(_blobUrl)
        return () => {
            setBlobUrl(undefined)
            URL.revokeObjectURL(_blobUrl)
        }
    }, [data])
    if (!blobUrl || !data) {
        return null
    }
    let inner: null | JSX.Element = null
    switch (mime.split('/', 1)[0]) {
        case 'text':
            let text
            try {
                text = new TextDecoder().decode(data.data)
                // sanitize and render
            } catch (exc) {
                console.error('Could not parse', exc)
                text = `${data.data}`
            }
            if (mime == 'text/html') {
                const sanitized = DOMPurify.sanitize(text)
                inner = (
                    <Grid
                        item
                        xs={12}
                        dangerouslySetInnerHTML={{ __html: sanitized }}
                    />
                )
            } else {
                inner = (
                    <Grid item xs={12}>
                        <pre>{text}</pre>
                    </Grid>
                )
            }
        case 'audio':
        case 'video':
            inner = (
                <Grid item xs={12}>
                    <video controls>
                        <source src={blobUrl} style={{ width: '100%' }} />
                    </video>
                </Grid>
            )
            break
        case 'image':
            inner = (
                <Grid item xs={12}>
                    <a href={blobUrl}>
                        <img
                            src={blobUrl}
                            alt={
                                data.tags.name && data.tags.name.length > 0
                                    ? data.tags.name[0]
                                    : ''
                            }
                            style={{ width: '100%' }}
                        />
                    </a>
                </Grid>
            )
            break
    }
    return (
        <Grid container spacing={2}>
            <Grid item xs={12}>
                <Typography variant="h5">Keywords</Typography>
                <Typography variant="body2">
                    {data.tags.keywords && data.tags.keywords.join(', ')}
                </Typography>
            </Grid>
            {inner}
            <Grid item xs={12}>
                <a href={blobUrl} type={mime} target="_blank">
                    <CloudDownloadIcon />
                </a>
            </Grid>
        </Grid>
    )
}

const AddFile = () => {
    const { classes, theme } = useStylesAndTheme()
    const { mainCtx } = React.useContext(MainContext)
    const { searchCtx } = React.useContext(SearchContext)
    const { config } = React.useContext(InitializedConfigContext)
    const client = useApolloClient()

    return (
        <Formik
            initialValues={{
                plainInput: '',
                htmlInput: '',
                fileInput: null as null | File,
                name: '',
                keywords: [] as string[],
                cluster: searchCtx.cluster,
            }}
            validate={(values) => {
                const errors: Partial<
                    { [key in keyof typeof values]: string }
                > = {}
                if (!values.name) {
                    errors['name'] = 'Name required'
                }
                if (!values.cluster) {
                    errors['cluster'] = 'Cluster required'
                }
                if (
                    (values.plainInput && values.htmlInput) ||
                    (values.plainInput && values.fileInput) ||
                    (values.htmlInput && values.fileInput)
                ) {
                    errors['plainInput'] = errors['htmlInput'] = errors[
                        'fileInput'
                    ] = 'only one can be set'
                } else if (
                    !values.plainInput &&
                    !values.htmlInput &&
                    !values.fileInput
                ) {
                    errors['plainInput'] = errors['htmlInput'] = errors[
                        'fileInput'
                    ] = 'empty'
                }

                return errors
            }}
            onSubmit={async (values, { setSubmitting, setValues }) => {
                let data: Blob
                if (values.htmlInput) {
                    data = new Blob([DOMPurify.sanitize(values.htmlInput)], {
                        type: 'text/html',
                    })
                } else if (values.plainInput) {
                    data = new Blob([values.plainInput], { type: 'text/plain' })
                } else if (values.fileInput) {
                    data = values.fileInput
                }
                const result = createContent({
                    client,
                    config,
                    cluster: main,
                })
            }}
        >
            {({ submitForm, isSubmitting, values, setValues }) => (
                <Form>
                    <Grid container spacing={1}>
                        <Grid item xs={12} md={4}>
                            <Field
                                component={FormikTextField}
                                name="name"
                                fullWidth
                                label="Name"
                                disabled={isSubmitting}
                            />
                        </Grid>
                        <Grid item xs={12} md={4}>
                            <SimpleSelect
                                name="keywords"
                                disabled={isSubmitting}
                                options={[]}
                                label="Keywords"
                                freeSolo
                            />
                        </Grid>

                        <Grid item xs={12} md={4}>
                            <ClusterSelect
                                url={mainCtx.url as string}
                                name="cluster"
                                disabled={isSubmitting}
                                label="Cluster"
                            />
                        </Grid>
                        {mainCtx.type != 'text' ? (
                            <Grid
                                item
                                xs={12}
                                sm={
                                    !values.plainInput &&
                                    !values.htmlInput &&
                                    !values.fileInput
                                        ? 6
                                        : undefined
                                }
                            >
                                <Field
                                    component={FormikTextField}
                                    name="plainInput"
                                    fullWidth
                                    multiline
                                    disabled={
                                        isSubmitting ||
                                        values.htmlInput ||
                                        values.fileInput
                                    }
                                />
                            </Grid>
                        ) : null}
                        <Grid
                            item
                            xs={12}
                            sm={
                                mainCtx.type != 'text' &&
                                !values.plainInput &&
                                !values.htmlInput &&
                                !values.fileInput &&
                                mainCtx.type != 'text'
                                    ? 6
                                    : undefined
                            }
                        >
                            <Field
                                name="htmlInput"
                                fullWidth
                                multiline
                                disabled={
                                    isSubmitting ||
                                    values.plainInput ||
                                    values.fileInput
                                }
                            >
                                {(formikFieldProps: FieldProps) => {
                                    return (
                                        <SunEditor
                                            width="100%"
                                            onChange={
                                                formikFieldProps.field.onChange
                                            }
                                        />
                                    )
                                }}
                            </Field>
                        </Grid>
                        <Grid item xs={12}>
                            <Field
                                name="fileInput"
                                disabled={
                                    isSubmitting ||
                                    values.plainInput ||
                                    values.htmlInput
                                }
                            >
                                {(formikFieldProps: FieldProps) => {
                                    return (
                                        <>
                                            <UploadButton
                                                accept={
                                                    mainCtx.type == 'text'
                                                        ? 'text/*'
                                                        : undefined
                                                }
                                            >
                                                <Button>Upload</Button>
                                            </UploadButton>
                                            <Button
                                                onClick={() =>
                                                    setValues({
                                                        ...values,
                                                        fileInput: null,
                                                    })
                                                }
                                            >
                                                Clear
                                            </Button>
                                        </>
                                    )
                                }}
                            </Field>
                        </Grid>
                        <Grid item xs={12}>
                            {isSubmitting && <LinearProgress />}
                        </Grid>
                        <Grid item xs={12}>
                            <Button
                                variant="contained"
                                color="primary"
                                disabled={isSubmitting}
                                onClick={submitForm}
                            >
                                Submit
                            </Button>
                        </Grid>
                    </Grid>
                </Form>
            )}
        </Formik>
    )
}

const EditFile = () => {
    const { classes, theme } = useStylesAndTheme()
    const { mainCtx } = React.useContext(MainContext)

    return (
        <Formik
            initialValues={{
                miscInput: null as null | File | string,
                name: '',
                keywords: [] as string[],
            }}
            onSubmit={async (values, { setSubmitting, setValues }) => {}}
        >
            {({ submitForm, isSubmitting, values, setValues }) => (
                <Grid container spacing={1}>
                    <Grid item xs={12} md={6}>
                        <Field
                            component={FormikTextField}
                            name="name"
                            fullWidth
                            label="Name"
                            disabled={isSubmitting}
                        />
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <SimpleSelect
                            name="keywords"
                            disabled={isSubmitting}
                            options={[]}
                            label="Keywords"
                            freeSolo
                        />
                    </Grid>
                    <Grid
                        item
                        xs={12}
                        sm={
                            !values.plainInput &&
                            !values.htmlInput &&
                            !values.fileInput
                                ? 6
                                : undefined
                        }
                    >
                        <Field
                            component={FormikTextField}
                            name="plainInput"
                            fullWidth
                            multiline
                            disabled={
                                isSubmitting ||
                                values.htmlInput ||
                                values.fileInput
                            }
                        />
                    </Grid>
                    <Grid
                        item
                        xs={12}
                        sm={
                            !values.plainInput &&
                            !values.htmlInput &&
                            !values.fileInput
                                ? 6
                                : undefined
                        }
                    >
                        <Field
                            name="htmlInput"
                            fullWidth
                            multiline
                            disabled={
                                isSubmitting ||
                                values.plainInput ||
                                values.fileInput
                            }
                        ></Field>
                    </Grid>
                    <Grid item xs={12}>
                        <Field
                            component={FormikSimpleFileUpload}
                            name="fileInput"
                            disabled={
                                isSubmitting ||
                                values.plainInput ||
                                values.htmlInput
                            }
                        >
                            <Button>Upload</Button>
                            <Button
                                onClick={() =>
                                    setValues({ ...values, fileInput: null })
                                }
                            >
                                Clear
                            </Button>
                        </Field>
                    </Grid>
                    <Grid item xs={12}>
                        {isSubmitting && <LinearProgress />}
                    </Grid>
                    <Grid item xs={12}>
                        <Button
                            variant="contained"
                            color="primary"
                            disabled={isSubmitting}
                            onClick={submitForm}
                        >
                            Submit
                        </Button>
                    </Grid>
                </Grid>
            )}
        </Formik>
    )
}

export default function FileComponent() {
    const { mainCtx } = React.useContext(MainContext)
    return (
        <DecisionFrame
            mainCtx={mainCtx}
            add={AddFile}
            view={ViewFile}
            edit={EditFile}
        />
    )
}
