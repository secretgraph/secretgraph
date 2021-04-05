import { ApolloClient, useApolloClient, useQuery } from '@apollo/client'
import { DialogContent } from '@material-ui/core'
import Button from '@material-ui/core/Button'
import Collapse from '@material-ui/core/Collapse'
import Dialog, { DialogProps } from '@material-ui/core/Dialog'
import DialogTitle from '@material-ui/core/DialogTitle'
import Grid from '@material-ui/core/Grid'
import IconButton from '@material-ui/core/IconButton'
import LinearProgress from '@material-ui/core/LinearProgress'
import List from '@material-ui/core/List'
import ListItem from '@material-ui/core/ListItem'
import ListItemText from '@material-ui/core/ListItemText'
import Typography from '@material-ui/core/Typography'
import AddIcon from '@material-ui/icons/Add'
import MoreVertIcon from '@material-ui/icons/MoreVert'
import { FastField, Field, Form, Formik } from 'formik'
import { TextField as FormikTextField } from 'formik-material-ui'
import * as React from 'react'
import { useAsync } from 'react-async'

import * as Constants from '../constants'
import * as Contexts from '../contexts'
import { getActionsQuery } from '../queries/node'
import {
    serializeToBase64,
    unserializeToArrayBuffer,
} from '../utils/encryption'

interface TokenDialogProps extends Omit<DialogProps, 'children' | ''> {
    disabled?: boolean
    tokens: string[]
    unknownTokens?: string[]
    knownHashes?: { [hash: string]: string[] }
    id: string
}

const matcher = /^(?:[^:]+:)?(.*?)/.compile()

// specify in hierachy for setting formik fields
export const TokenDialog = ({
    id,
    disabled,
    tokens,
    unknownTokens = [],
    knownHashes = {},
    ...props
}: TokenDialogProps) => {
    const { config } = React.useContext(Contexts.InitializedConfig)
    const [hashMapper, setHashMapper] = React.useState<any[]>([])
    const { data: dataUnfinished } = useQuery(getActionsQuery, {
        pollInterval: 60000,
        variables: {
            variables: {
                id,
                authorization: tokens,
            },
        },
        onCompleted: async (data) => {
            const prepare = []
            const hashalgo =
                Constants.mapHashNames[data.config.hashAlgorithms[0]]
                    .operationName
            for (const token of unknownTokens) {
                prepare.push({
                    token,
                    newHash: serializeToBase64(
                        unserializeToArrayBuffer(
                            (token.match(matcher) as RegExpMatchArray)[1]
                        ).then((val) => crypto.subtle.digest(hashalgo, val))
                    ),
                    oldHash: null,
                })
            }
            for (const hash of Object.keys(knownHashes)) {
                prepare.push({
                    token: config.tokens[hash],
                    newHash: serializeToBase64(
                        unserializeToArrayBuffer(
                            config.tokens[hash]
                        ).then((val) => crypto.subtle.digest(hashalgo, val))
                    ),
                    oldHash: hash,
                })
            }
            setHashMapper(
                Object.fromEntries(
                    (await Promise.all(prepare)).map((val) => {
                        return [val.newHash, val]
                    })
                )
            )
        },
    })
    const finishedList = React.useMemo(() => {
        if (!dataUnfinished) {
            return []
        }
    }, [dataUnfinished, config])

    return (
        <Dialog {...props}>
            <DialogTitle>Tokens</DialogTitle>
            <DialogContent>
                <List></List>
            </DialogContent>
        </Dialog>
    )
}
