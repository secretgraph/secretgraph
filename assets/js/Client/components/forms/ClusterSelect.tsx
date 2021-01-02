import * as React from 'react'

import { InitializedConfigContext } from '../../contexts'

import SimpleSelect from './SimpleSelect'

export default function ClusterSelect({ url }: { url: string }) {
    const [options, setOptions] = React.useState([])
    const [open, setOpen] = React.useState(false)
    const { config } = React.useContext(InitializedConfigContext)
    return (
        <SimpleSelect
            name="cluster"
            options={options}
            open={open}
            onOpen={() => {
                setOpen(true)
            }}
            onClose={() => {
                setOpen(false)
            }}
        />
    )
}
