import { ApolloClient, useApolloClient } from '@apollo/client'
import { Grid } from '@material-ui/core'
import Button from '@material-ui/core/Button'
import Chip from '@material-ui/core/Chip'
import Collapse from '@material-ui/core/Collapse'
import Divider from '@material-ui/core/Divider'
import Drawer from '@material-ui/core/Drawer'
import Hidden from '@material-ui/core/Hidden'
import IconButton from '@material-ui/core/IconButton'
import InputAdornment from '@material-ui/core/InputAdornment'
import List from '@material-ui/core/List'
import ListItem from '@material-ui/core/ListItem'
import ListItemIcon from '@material-ui/core/ListItemIcon'
import ListItemText from '@material-ui/core/ListItemText'
import Popover from '@material-ui/core/Popover'
import TextField from '@material-ui/core/TextField'
import Tooltip from '@material-ui/core/Tooltip'
import useMediaQuery from '@material-ui/core/useMediaQuery'
import ChevronLeftIcon from '@material-ui/icons/ChevronLeft'
import ChevronRightIcon from '@material-ui/icons/ChevronRight'
import ExpandLessIcon from '@material-ui/icons/ExpandLess'
import ExpandMoreIcon from '@material-ui/icons/ExpandMore'
import FilterListIcon from '@material-ui/icons/FilterList'
import Autocomplete, {
    AutocompleteProps,
    createFilterOptions,
} from '@material-ui/lab/Autocomplete'
import * as React from 'react'

import { mapHashNames } from '../../constants'
import * as contexts from '../../contexts'
import { getClusterQuery } from '../../queries/cluster'
import { serverConfigQuery } from '../../queries/server'
import { useStylesAndTheme } from '../../theme'
import { extractPublicInfo } from '../../utils/cluster'
import { extractAuthInfo } from '../../utils/config'
import { loadAndExtractClusterInfo } from '../../utils/operations'
import { CapturingSuspense } from '../misc'

function CloseButton() {
    const { theme } = useStylesAndTheme()
    const { updateOpen } = React.useContext(contexts.OpenSidebar)
    const matches = useMediaQuery(theme.breakpoints.up('lg'))
    return (
        <IconButton
            style={{ display: matches ? 'none' : undefined }}
            onClick={() => updateOpen(false)}
        >
            {theme.direction === 'ltr' ? (
                <ChevronLeftIcon />
            ) : (
                <ChevronRightIcon />
            )}
        </IconButton>
    )
}

function TagsSelect({
    value,
    label,
    onChange,
}: {
    value: string[]
    label: string
    onChange: AutocompleteProps<string, true, false, true>['onChange']
}) {
    return (
        <Autocomplete
            multiple
            value={value}
            freeSolo
            fullWidth
            options={value}
            onChange={onChange}
            renderTags={(value: string[], getTagProps: any) =>
                value.map((option: string, index: number) => (
                    <Chip
                        size="small"
                        variant="outlined"
                        label={option}
                        {...getTagProps({ index })}
                    />
                ))
            }
            renderInput={(params) => (
                <TextField
                    {...params}
                    label={label}
                    variant="outlined"
                    size="small"
                    margin="dense"
                    multiline
                />
            )}
        />
    )
}
function HeaderPopover() {
    const { searchCtx, updateSearchCtx } = React.useContext(contexts.Search)
    return (
        <Grid container>
            <Grid item xs={12}>
                <TagsSelect
                    label="Include Tags"
                    value={searchCtx.include}
                    onChange={(event, value, reason) => {
                        updateSearchCtx({ include: value })
                    }}
                />
            </Grid>
            <Grid item xs={12}>
                <TagsSelect
                    label="Exclude Tags"
                    value={searchCtx.exclude}
                    onChange={(event, value, reason) => {
                        updateSearchCtx({ exclude: value })
                    }}
                />
            </Grid>
        </Grid>
    )
}

function MainSearchField() {
    const { classes, theme } = useStylesAndTheme()
    const { activeUrl, updateActiveUrl } = React.useContext(contexts.ActiveUrl)
    const { config, updateConfig } = React.useContext(contexts.Config)
    const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null)
    const client = useApolloClient()
    return (
        <>
            <Popover open={!!anchorEl} anchorEl={anchorEl}>
                <HeaderPopover />
            </Popover>
            <Autocomplete
                className={classes.sideBarHeaderSelect}
                freeSolo
                value={activeUrl}
                options={Object.keys(config ? config.hosts : {})}
                disableClearable
                onChange={async (event: any, value: any, reason: string) => {
                    if (!value) return
                    switch (reason) {
                        case 'create-option':
                            if (config && !config.hosts[value]) {
                                const hashAlgos = []
                                try {
                                    const result = await client.query({
                                        query: serverConfigQuery,
                                    })
                                    for (const algo of result.data.secretgraph
                                        .config.hashAlgorithms) {
                                        const mappedName =
                                            mapHashNames[algo].operationName
                                        if (mappedName) {
                                            hashAlgos.push(mappedName)
                                        }
                                    }
                                } catch (exc) {
                                    console.warn('Cannot add host', exc)
                                    return
                                }
                                if (!hashAlgos) {
                                    console.warn(
                                        'Cannot add host, no fitting hash algos found'
                                    )
                                    return
                                }
                                const newConfig = {
                                    ...config,
                                    hosts: {
                                        ...config.hosts,
                                    },
                                }
                                hashAlgos
                                newConfig.hosts[value] = {
                                    hashAlgorithms: hashAlgos,
                                    clusters: {},
                                    contents: {},
                                }
                                updateConfig(newConfig)
                            }
                            updateActiveUrl(value)
                            break
                        case 'select-option':
                            // TODO: update hash list
                            updateActiveUrl(value)
                            break
                        case 'remove-option':
                            if (
                                config &&
                                config.hosts[value] &&
                                Object.keys(config.hosts[value]).length === 0
                            ) {
                                const newConfig = {
                                    ...config,
                                    clusters: {
                                        ...config.hosts,
                                    },
                                }
                                delete newConfig.hosts[value]
                                updateConfig(newConfig)
                            }
                    }
                }}
                renderInput={({ InputProps, ...params }) => {
                    InputProps.endAdornment = (
                        <>
                            <Tooltip title="Toggle filter popover">
                                <InputAdornment position="end">
                                    <IconButton
                                        aria-label="toggle filter popover"
                                        onClick={(ev) =>
                                            anchorEl
                                                ? setAnchorEl(null)
                                                : setAnchorEl(ev.currentTarget)
                                        }
                                        onMouseDown={(event) => {
                                            event.preventDefault()
                                        }}
                                        edge="end"
                                    >
                                        <FilterListIcon />
                                    </IconButton>
                                </InputAdornment>
                            </Tooltip>
                            {InputProps.endAdornment}
                        </>
                    )
                    return (
                        <TextField
                            {...params}
                            InputProps={InputProps}
                            label="Set Url"
                            variant="outlined"
                            size="small"
                            margin="dense"
                        />
                    )
                }}
            />
        </>
    )
}

export default function SideBarHeader() {
    const { classes, theme } = useStylesAndTheme()
    return (
        <div className={classes.sideBarHeader}>
            {theme.direction === 'rtl' ? <CloseButton /> : null}
            <MainSearchField />
            {theme.direction === 'ltr' ? <CloseButton /> : null}
        </div>
    )
}