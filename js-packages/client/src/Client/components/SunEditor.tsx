import 'suneditor/dist/css/suneditor.min.css'

import TextField, { TextFieldProps } from '@mui/material/TextField'
import * as React from 'react'
import SunEditor from 'suneditor-react'
import SunEditorCore from 'suneditor/src/lib/core'

export const SunEditorWrapper = React.forwardRef<HTMLDivElement>(
    function SunEditorWrapper(
        {
            inputRef,
            value,
            disabled,
            onBlur,
            onChange,
            ...props
        }: { inputRef?: React.RefObject<any> } & Parameters<
            typeof SunEditor
        >[0] &
            TextFieldProps['inputProps'],
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
            <div style={{ marginTop: '30px' }} ref={ref}>
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

export default function SunEditorField({
    InputProps,
    inputRef,
    ...props
}: TextFieldProps & {
    InputProps?: Parameters<typeof SunEditor>[0] & TextFieldProps['InputProps']
}) {
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
