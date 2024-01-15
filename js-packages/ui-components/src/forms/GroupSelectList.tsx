import { ApolloClient, useQuery } from '@apollo/client'
import List from '@mui/material/List'
import Table from '@mui/material/Table'
import TableRow from '@mui/material/TableRow'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import ListItem from '@mui/material/ListItem'
import Typography from '@mui/material/Typography'
import { clusterFeedQuery } from '@secretgraph/graphql-queries/cluster'
import * as Constants from '@secretgraph/misc/constants'
import { checkPrefix, fromGraphqlId } from '@secretgraph/misc/utils/encoding'
import FormikCheckbox from '../formik/FormikCheckbox'
import { Field, FieldProps, useField } from 'formik'
import * as React from 'react'

/***
 *  for search
                let roption = labelMap[option]?.name || ''
                let rawId = option
                try {
                    rawId = (fromGraphqlId(option) as [string, string])[1]
                } catch (e) {}
                return `${roption}${rawId}`
 */
export interface GroupSelectListProps {
    initial: boolean
    name: string
    admin?: boolean
    disabled?: boolean
    groups: {
        name: string
        description: string
        userSelectable: keyof typeof Constants.UserSelectable
        hidden: boolean
        properties: string[]
        injectedKeys?: {
            link: string
            hash: string
        }[]
    }[]
}

export default function GroupSelectList({
    name,
    initial,
    admin = false,
    disabled,
    groups,
}: GroupSelectListProps) {
    const [field, meta, helpers] = useField(name)
    const renderval = React.useMemo(() => {
        const renderval = []
        // sorted copy
        groups = groups.slice().sort((a, b) => {
            if (a.name < b.name) {
                return -1
            }
            if (a.name > b.name) {
                return 1
            }
            return 0
        })
        for (const group of groups) {
            let isDisabled = disabled
            if (!admin) {
                if (group.userSelectable == Constants.UserSelectable.NONE) {
                    isDisabled = true
                } else if (
                    group.userSelectable ==
                    Constants.UserSelectable.INITIAL_MODIFYABLE
                ) {
                    if (!initial) {
                        isDisabled = true
                    }
                } else if (
                    group.userSelectable == Constants.UserSelectable.SELECTABLE
                ) {
                    if (meta.initialValue.includes(group.name)) {
                        isDisabled = true
                    } else if (
                        initial &&
                        group.properties.includes('default')
                    ) {
                        isDisabled = true
                        // force change to true
                        if (!meta.value.includes(group.name)) {
                            helpers.setValue(
                                [...meta.value, group.name],
                                false
                            )
                        }
                    }
                } else if (
                    group.userSelectable ==
                    Constants.UserSelectable.DESELECTABLE
                ) {
                    if (
                        !meta.initialValue.includes(group.name) &&
                        (!initial || !group.properties.includes('default'))
                    ) {
                        isDisabled = true
                    } else if (
                        initial &&
                        !group.properties.includes('default')
                    ) {
                        // force change to false
                        if (initial && meta.value.includes(group.name)) {
                            helpers.setValue(
                                meta.value.filter(
                                    (val: string) => val != group.name
                                ),
                                false
                            )
                        }
                    }
                }
            }

            renderval.push(
                <TableRow key={group.name}>
                    <TableCell padding="checkbox">
                        <Field
                            name={name}
                            value={group.name}
                            component={FormikCheckbox}
                            color="primary"
                            disabled={isDisabled}
                            type="checkbox"
                            multiple
                        />
                    </TableCell>
                    <TableCell align="right">{group.name}</TableCell>
                    <TableCell align="right">{group.description}</TableCell>
                </TableRow>
            )
        }
        return renderval
    }, [name, initial, groups])
    return (
        <TableContainer>
            <Table>
                <TableHead>
                    <TableRow>
                        <TableCell></TableCell>
                        <TableCell align="right">Name</TableCell>
                        <TableCell align="right">Description</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>{renderval}</TableBody>
            </Table>
        </TableContainer>
    )
}
