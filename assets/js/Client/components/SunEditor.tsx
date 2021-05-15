import 'suneditor/dist/css/suneditor.min.css'

import TextField, { TextFieldProps } from '@material-ui/core/TextField'
import * as React from 'react'
import SunEditorTyped, { SunEditorReactProps } from 'suneditor-react'

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
                setContents={value}
                onChange={(val: string) => {
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
