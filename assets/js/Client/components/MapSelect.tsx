import * as React from 'react'
import TextField, { TextFieldProps } from '@material-ui/core/TextField'

export function createOptionsIterator(mapObject: Map<string, any>) {
    return {
        *[Symbol.iterator]() {
            for (const [key, value] of mapObject) {
                yield (
                    <option value={key} key={key}>
                        {value.label}
                    </option>
                )
            }
        },
    }
}

export type MapSelectProps = {
    options: Map<string, any>
} & Omit<TextFieldProps, 'select' | 'SelectProps' | 'children'>

export default function MapSelect({ options, ...props }: MapSelectProps) {
    return (
        <TextField
            select
            style={{ color: 'inherit' }}
            SelectProps={{
                native: true,
            }}
            {...props}
        >
            {createOptionsIterator(options)}
        </TextField>
    )
}
