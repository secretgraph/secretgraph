import { useApolloClient, useQuery } from '@apollo/client'
import { useTheme } from '@mui/material/styles'
import * as Contexts from '@secretgraph/client/contexts'
import { saveAs } from 'file-saver'
import * as React from 'react'

type Props = {}

const ViewPostbox = (props: Props) => {
    const theme = useTheme()
    const { mainCtx } = React.useContext(Contexts.Main)
    const client = useApolloClient()
    const { config } = React.useContext(Contexts.Config)
    return <></>
}

const AddPostbox = (props: Props) => {
    const theme = useTheme()

    return <></>
}

const EditPostbox = (props: Props) => {
    const theme = useTheme()

    return <></>
}

export default function PostboxComponent(props: Props) {
    const { mainCtx } = React.useContext(Contexts.Main)
    if (mainCtx.action == 'view' && mainCtx.item) {
        return <ViewPostbox />
    } else if (mainCtx.action == 'update' && mainCtx.item) {
        return <EditPostbox />
    } else if (mainCtx.action == 'create') {
        return <AddPostbox />
    }
    return null
}
