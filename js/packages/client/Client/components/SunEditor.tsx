import 'suneditor/dist/css/suneditor.min.css'

import TextField, { TextFieldProps } from '@material-ui/core/TextField'
import * as React from 'react'
import SunEditor from 'suneditor-react'
import SunEditorCore from 'suneditor/src/lib/core'

export function SunEditorWrapper({
    inputRef,
    value,
    disabled,
    onBlur,
    onChange,
    ...props
}: { inputRef?: React.RefObject<any> } & Parameters<typeof SunEditor>[0] &
    TextFieldProps['inputProps']) {
    const ref = React.useRef<SunEditorCore>()
    React.useImperativeHandle(
        inputRef,
        () => ({
            value: ref.current ? ref.current.getContents(true) : value,
            focus: () => {
                ref.current && ref.current.show()
            },
        }),
        [ref.current]
    )
    return (
        <div style={{ marginTop: '30px' }}>
            <SunEditor
                getSunEditorInstance={(instance) => (ref.current = instance)}
                disable={disabled}
                {...props}
                setContents={value}
                onChange={(val: string) => {
                    ref.current?.save()
                    if (ref.current && onChange) {
                        onChange({
                            type: 'change',
                            target:
                                ref.current.core.context.element.originElement,
                            currentTarget:
                                ref.current.core.context.element.originElement,
                        } as any)
                    }
                }}
                onBlur={() => {
                    if (ref.current && onBlur) {
                        onBlur({
                            type: 'blur',
                            target:
                                ref.current.core.context.element.originElement,
                            currentTarget:
                                ref.current.core.context.element.originElement,
                        } as any)
                    }
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
                inputComponent: SunEditorWrapper,
                inputProps: {
                    width: '100%',
                },
            }}
        />
    )
}
