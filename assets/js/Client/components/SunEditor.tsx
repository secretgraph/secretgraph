import * as React from 'react'
import CloudDownloadIcon from '@material-ui/icons/CloudDownload'
import Card from '@material-ui/core/Card'
import CardContent from '@material-ui/core/CardContent'
import { Autocomplete as FormikAutocomplete } from 'formik-material-ui-lab'
import LinearProgress from '@material-ui/core/LinearProgress'
import SunEditorTyped, { SunEditorReactProps } from 'suneditor-react'
import 'suneditor/dist/css/suneditor.min.css'
import * as DOMPurify from 'dompurify'
import Button from '@material-ui/core/Button'
import TextField, { TextFieldProps } from '@material-ui/core/TextField'
import Typography from '@material-ui/core/Typography'

import Grid from '@material-ui/core/Grid'
import { useAsync } from 'react-async'

import { Formik, FieldProps, Form, FastField, Field } from 'formik'

import {
    TextField as FormikTextField,
    SimpleFileUpload as FormikSimpleFileUpload,
} from 'formik-material-ui'

const SunEditorUntyped = SunEditorTyped as any

export function SunEditorWrapper({
    inputRef,
    ...props
}: { inputRef: React.RefObject<any> } & SunEditorReactProps) {
    return <SunEditorUntyped ref={inputRef} {...props} />
}

export default function SunEditorField(props: TextFieldProps) {
    return (
        <TextField
            label="Html Text"
            fullWidth
            variant="outlined"
            multiline
            {...props}
            InputProps={{
                inputComponent: SunEditorWrapper as any,
                inputProps: {
                    width: '100%',
                    disable: props.disabled,
                    setContent: props.value,
                } as any,
            }}
        />
    )
}
