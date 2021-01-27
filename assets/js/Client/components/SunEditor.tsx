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
import { InputBaseProps } from '@material-ui/core/InputBase'
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
    value,
    disabled,
    onBlur,
    onChange,
    ...props
}: { inputRef?: React.RefObject<any> } & SunEditorReactProps &
    TextFieldProps['InputProps'] & { onChange: TextFieldProps['onChange'] }) {
    const ref = React.useRef<any>()
    React.useImperativeHandle(
        inputRef,
        () => ({
            value: ref.current ? ref.current.editor.getContents(true) : value,
            focus: () => {
                ref.current && ref.current.editor.show()
            },
        }),
        [ref.current]
    )
    return (
        <div style={{ marginTop: '30px' }}>
            <SunEditorUntyped
                ref={ref}
                disable={disabled}
                {...props}
                setContent={value}
                onChange={(val: string) => {
                    //console.log(ref.current, props)
                    ref.current.editor.save()
                    ref.current &&
                        onChange &&
                        onChange({
                            type: 'change',
                            target: ref.current.txtArea.current,
                            currentTarget: ref.current.txtArea.current,
                        } as any)
                }}
                onBlur={() => {
                    ref.current &&
                        onBlur &&
                        onBlur({
                            type: 'blur',
                            target: ref.current.txtArea.current,
                            currentTarget: ref.current.txtArea.current,
                        } as any)
                }}
            />
        </div>
    )
}

export default function SunEditorField({
    InputProps,
    ...props
}: TextFieldProps) {
    return (
        <TextField
            fullWidth
            variant="outlined"
            multiline
            {...props}
            InputProps={{
                ...InputProps,
                inputComponent: SunEditorWrapper as any,
                inputProps: {
                    width: '100%',
                },
            }}
        />
    )
}
