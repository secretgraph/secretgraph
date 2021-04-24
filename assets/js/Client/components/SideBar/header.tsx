import { ApolloClient, useApolloClient } from '@apollo/client'
import { Grid } from '@material-ui/core'
import Button from '@material-ui/core/Button'
import Checkbox from '@material-ui/core/Checkbox'
import Chip from '@material-ui/core/Chip'
import Divider from '@material-ui/core/Divider'
import Drawer from '@material-ui/core/Drawer'
import FormControlLabel from '@material-ui/core/FormControlLabel'
import FormGroup from '@material-ui/core/FormGroup'
import Hidden from '@material-ui/core/Hidden'
import IconButton from '@material-ui/core/IconButton'
import InputAdornment from '@material-ui/core/InputAdornment'
import List from '@material-ui/core/List'
import ListItem from '@material-ui/core/ListItem'
import ListItemIcon from '@material-ui/core/ListItemIcon'
import ListItemText from '@material-ui/core/ListItemText'
import Paper from '@material-ui/core/Paper'
import Popover from '@material-ui/core/Popover'
import TextField from '@material-ui/core/TextField'
import Tooltip from '@material-ui/core/Tooltip'
import Typography from '@material-ui/core/Typography'
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
import * as Contexts from '../../contexts'
import { serverConfigQuery } from '../../queries/server'
import { useStylesAndTheme } from '../../theme'
import { extractAuthInfo } from '../../utils/config'
import { deleteNodes, resetDeletionNodes } from '../../utils/operations'

function CloseButton() {
    const { theme } = useStylesAndTheme()
    const { setOpen } = React.useContext(Contexts.OpenSidebar)
    const matches = useMediaQuery(theme.breakpoints.up('lg'))
    return (
        <IconButton
            style={{ display: matches ? 'none' : undefined }}
            onClick={() => setOpen(false)}
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
    const { searchCtx, updateSearchCtx } = React.useContext(Contexts.Search)
    const { theme } = useStylesAndTheme()
    return (
        <Paper style={{ padding: theme.spacing(2) }}>
            <Grid container spacing={2}>
                <Grid item xs={12}>
                    <Typography align="center" variant="h3">
                        Filter
                    </Typography>
                </Grid>
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
                <Grid item xs={12}>
                    <FormGroup row>
                        <FormControlLabel
                            control={
                                <Checkbox
                                    checked={searchCtx.deleted}
                                    onChange={(event) => {
                                        updateSearchCtx({
                                            deleted: event.target.checked,
                                        })
                                    }}
                                />
                            }
                            label="Deleted"
                        />
                    </FormGroup>
                </Grid>
            </Grid>
        </Paper>
    )
}

function MainSearchField() {
    const { searchCtx } = React.useContext(Contexts.Search)
    const { classes, theme } = useStylesAndTheme()
    const { activeUrl, setActiveUrl } = React.useContext(Contexts.ActiveUrl)
    const { config, updateConfig } = React.useContext(Contexts.Config)
    const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null)
    const client = useApolloClient()
    return (
        <>
            <Popover
                open={!!anchorEl}
                anchorEl={anchorEl}
                onClose={() => {
                    setAnchorEl(null)
                }}
            >
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
                            setActiveUrl(value)
                            break
                        case 'select-option':
                            // TODO: update hash list
                            setActiveUrl(value)
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
                                        style={{
                                            color:
                                                searchCtx.deleted ||
                                                searchCtx.exclude.length ||
                                                searchCtx.include.length
                                                    ? 'red'
                                                    : undefined,
                                        }}
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
    const { selected } = React.useContext(Contexts.SidebarItemsSelected)
    const { searchCtx } = React.useContext(Contexts.Search)
    const { config } = React.useContext(Contexts.Config)
    const { activeUrl } = React.useContext(Contexts.ActiveUrl)
    const client = useApolloClient()
    const authorization = React.useMemo(() => {
        if (!config) {
            return []
        }
        return extractAuthInfo({
            config,
            url: activeUrl,
            require: new Set(['delete', 'manage']),
        }).tokens
    }, [config, activeUrl])
    return (
        <>
            <div className={classes.sideBarHeader}>
                {theme.direction === 'rtl' ? <CloseButton /> : null}
                <MainSearchField />
                {theme.direction === 'ltr' ? <CloseButton /> : null}
            </div>
            <div>
                <Button
                    disabled={!selected.length}
                    onClick={async () => {
                        const ids = selected
                            .map((val) => {
                                const m = val.match(/.*::(.+?)$/)
                                if (!m) {
                                    return null
                                }
                                return m[1]
                            })
                            .filter((val) => val) as string[]
                        if (searchCtx.deleted) {
                            await resetDeletionNodes({
                                client,
                                authorization,
                                ids,
                            })
                        } else {
                            await deleteNodes({
                                client,
                                authorization,
                                ids,
                            })
                        }
                    }}
                >
                    {searchCtx.deleted ? 'Restore selected' : 'Delete selected'}
                </Button>
            </div>
        </>
    )
}
