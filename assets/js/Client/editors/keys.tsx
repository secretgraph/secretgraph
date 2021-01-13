import * as React from 'react'
import { Theme } from '@material-ui/core/styles'
import CircularProgress from '@material-ui/core/CircularProgress'

import { saveAs } from 'file-saver'
import { useQuery, useApolloClient } from '@apollo/client'

import { ConfigInterface } from '../interfaces'
import { MainContext, ConfigContext } from '../contexts'
import { decryptContentId } from '../utils/operations'
import DecisionFrame from '../components/DecisionFrame'

import { contentRetrievalQuery } from '../queries/content'
import { useStylesAndTheme } from '../theme'
import { newClusterLabel } from '../messages'

type Props = {}

const ViewKeys = (props: Props) => {
    const { classes, theme } = useStylesAndTheme()
    const { mainCtx } = React.useContext(MainContext)
    const client = useApolloClient()
    const { config } = React.useContext(ConfigContext)
    return <></>
}

const AddKeys = (props: Props) => {
    const { classes, theme } = useStylesAndTheme()

    return <></>
}

const EditKeys = (props: Props) => {
    const { classes, theme } = useStylesAndTheme()

    return <></>
}

export default function KeyComponent(props: Props) {
    const { mainCtx, updateMainCtx } = React.useContext(MainContext)
    if (mainCtx.type == 'PrivateKey') {
        // FIXME: reload as PublicKey
        updateMainCtx({ item: null })
        return null
    }
    return (
        <DecisionFrame
            mainCtx={mainCtx}
            view={ViewKeys}
            edit={EditKeys}
            add={AddKeys}
        />
    )
}
