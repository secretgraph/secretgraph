import 'suneditor/dist/css/suneditor.min.css'

import TextField, { TextFieldProps } from '@mui/material/TextField'
import * as React from 'react'
import SunEditor from 'suneditor-react'
import SunEditorCore from 'suneditor/src/lib/core'

export type SunEditorProps = Omit<
    Parameters<typeof SunEditor>[0],
    'onBlur' | 'onChange' | 'setContents'
> & {
    disabled?: boolean
    onBlur?: TextFieldProps['onBlur']
    onChange?: TextFieldProps['onChange']
}

export const SunEditorWrapper = React.forwardRef<HTMLDivElement>(
    function SunEditorWrapper(
        {
            inputRef,
            value,
            disabled,
            onBlur,
            onChange,
            ...props
        }: SunEditorProps & { inputRef?: React.RefObject<any>; value: string },
        ref
    ) {
        const suneditor = React.useRef<SunEditorCore>()
        React.useImperativeHandle(
            inputRef,
            () => ({
                value: suneditor.current
                    ? suneditor.current.getContents(true)
                    : value,
                focus: () => {
                    suneditor.current && suneditor.current.show()
                },
            }),
            [suneditor.current]
        )
        return (
            <div
                style={{ marginTop: '30px', width: '100%', height: '100%' }}
                ref={ref}
            >
                <SunEditor
                    getSunEditorInstance={(instance) =>
                        (suneditor.current = instance)
                    }
                    disable={disabled}
                    {...props}
                    setContents={value}
                    onChange={(val: string) => {
                        suneditor.current?.save()
                        if (suneditor.current && onChange) {
                            onChange({
                                type: 'change',
                                target: suneditor.current.core.context.element
                                    .originElement,
                                currentTarget:
                                    suneditor.current.core.context.element
                                        .originElement,
                            } as any)
                        }
                    }}
                    onBlur={() => {
                        if (suneditor.current && onBlur) {
                            onBlur({
                                type: 'blur',
                                target: suneditor.current.core.context.element
                                    .originElement,
                                currentTarget:
                                    suneditor.current.core.context.element
                                        .originElement,
                            } as any)
                        }
                    }}
                />
            </div>
        )
    }
)

// SunEditor for exports outside
export default function SunEditorField({
    InputProps,
    inputRef,
    ...props
}: Omit<TextFieldProps, 'InputProps'> & {
    InputProps?: Omit<TextFieldProps['InputProps'], 'inputProps'> & {
        inputProps: SunEditorProps
    }
}) {
    return (
        <TextField
            fullWidth
            variant="outlined"
            multiline
            {...props}
            InputProps={
                {
                    ...InputProps,
                    inputComponent: SunEditorWrapper,
                } as any
            }
        />
    )
}
