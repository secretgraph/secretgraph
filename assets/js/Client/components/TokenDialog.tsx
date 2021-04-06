import { ApolloClient, useApolloClient, useQuery } from '@apollo/client'
import {
    Checkbox,
    DialogActions,
    DialogContent,
    ListItemIcon,
    ListSubheader,
    Menu,
    MenuItem,
} from '@material-ui/core'
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
import * as SetOps from '../utils/set'

interface TokenDialogProps extends Omit<DialogProps, 'children' | ''> {
    disabled?: boolean
    tokens: string[]
    unknownTokens?: string[]
    knownHashes?: { [hash: string]: string[] }
    id: string
}

const matcher = /^(?:[^:]+:)?(.*?)/.compile()
const availableActionsSet = new Set(['manage', 'push', 'view', 'update'])

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
    const [selected, setSelected] = React.useState(new Set<string>())
    const [hashMapper, setHashMapper] = React.useState<{
        [keyHash: string]: {
            token: string
            note: string
            newHash: string
            oldHash: null | string
            configActions: Set<string>
            newActions: Set<string>
        }
    }>({})
    const { data: dataUnfinished } = useQuery(getActionsQuery, {
        pollInterval: 60000,
        variables: {
            variables: {
                id,
                authorization: tokens,
            },
        },
        onCompleted: async (data) => {
            const prepare: PromiseLike<{
                token: string
                note: string
                newHash: string
                oldHash: null | string
                configActions: Set<string>
                newActions: Set<string>
            }>[] = []
            const premapper: {
                [hash: string]: { [type: string]: Set<string | null> }
            } = {}
            for (const entry of data.secretgraph.node.availableActions) {
                if (!premapper[entry.keyHash]) {
                    premapper[entry.keyHash] = { [entry.type]: new Set() }
                }
                if (!premapper[entry.keyHash][entry.type]) {
                    premapper[entry.keyHash][entry.type] = new Set()
                }
                premapper[entry.keyHash][entry.type].add(entry.id)
            }
            const hashalgo =
                Constants.mapHashNames[
                    data.secretgraph.config.hashAlgorithms[0]
                ].operationName
            for (const token of unknownTokens) {
                prepare.push(
                    serializeToBase64(
                        unserializeToArrayBuffer(
                            (token.match(matcher) as RegExpMatchArray)[1]
                        ).then((val) => crypto.subtle.digest(hashalgo, val))
                    ).then((val) => ({
                        token,
                        note: '',
                        newHash: val,
                        oldHash: null,
                        configActions: new Set<string>(),
                        newActions: new Set<string>(
                            premapper[val] ? Object.keys(premapper[val]) : []
                        ),
                    }))
                )
            }
            for (const [hash, actions] of Object.entries(knownHashes)) {
                prepare.push(
                    serializeToBase64(
                        unserializeToArrayBuffer(
                            config.tokens[hash].token
                        ).then((val) => crypto.subtle.digest(hashalgo, val))
                    ).then((val) => ({
                        token: config.tokens[hash].token,
                        note: config.tokens[hash].note,
                        newHash: val,
                        oldHash: hash,
                        configActions: new Set<string>(actions),
                        newActions: new Set<string>(
                            premapper[val] ? Object.keys(premapper[val]) : []
                        ),
                    }))
                )
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

        const finishedList = []
        for (const action of dataUnfinished.node.availableActions) {
            const existingActionData = hashMapper[action.keyHash]
            finishedList.push(
                <ListItem>
                    <ListItemIcon>
                        <Checkbox
                            edge="start"
                            checked={selected.has(action.keyHash)}
                            tabIndex={-1}
                            disableRipple
                        />
                    </ListItemIcon>
                    <ListItemText></ListItemText>
                </ListItem>
            )
        }
        return finishedList
    }, [dataUnfinished, config])

    return (
        <Dialog {...props}>
            <DialogTitle>Tokens</DialogTitle>
            <DialogContent>
                <List>
                    <ListSubheader>
                        <ListItemIcon>
                            <Checkbox
                                edge="start"
                                checked={selected.size == finishedList.length}
                                tabIndex={-1}
                                disableRipple
                            />
                        </ListItemIcon>
                    </ListSubheader>
                </List>
            </DialogContent>
            <DialogActions>
                <Button>Persist Tokens</Button>
                <Button
                    disabled={Object.values(hashMapper).every(
                        (val) =>
                            !val.oldHash ||
                            (val.oldHash == val.newHash &&
                                SetOps.isNotEq(
                                    SetOps.intersection(
                                        availableActionsSet,
                                        val.configActions
                                    ),
                                    val.newActions
                                ))
                    )}
                >
                    Update Tokens
                </Button>
                <Button>Close</Button>
            </DialogActions>
        </Dialog>
    )
}
