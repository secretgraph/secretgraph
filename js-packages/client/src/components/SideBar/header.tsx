import { useApolloClient } from '@apollo/client'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import FilterListIcon from '@mui/icons-material/FilterList'
import Autocomplete, { AutocompleteProps } from '@mui/material/Autocomplete'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormGroup from '@mui/material/FormGroup'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import Paper from '@mui/material/Paper'
import Popover from '@mui/material/Popover'
import Stack from '@mui/material/Stack'
import { useTheme } from '@mui/material/styles'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import useMediaQuery from '@mui/material/useMediaQuery'
import { authInfoFromConfig } from '@secretgraph/misc/utils/config'
import {
    deleteNodes,
    resetDeletionNodes,
} from '@secretgraph/misc/utils/operations'
import * as React from 'react'

import * as Contexts from '../../contexts'

function CloseButton() {
    const theme = useTheme()
    const { setOpen } = React.useContext(Contexts.OpenSidebar)
    const matches = useMediaQuery(theme.breakpoints.up('lg'))
    return (
        <IconButton
            style={{ display: matches ? 'none' : undefined }}
            onClick={() => setOpen(false)}
            size="small"
            edge="end"
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
                />
            )}
        />
    )
}
function HeaderPopover() {
    const { searchCtx, updateSearchCtx } = React.useContext(Contexts.Search)
    const theme = useTheme()
    return (
        <Paper style={{ padding: theme.spacing(2) }}>
            <Stack spacing={2}>
                <Typography align="center" variant="h3">
                    Filter
                </Typography>
                <TagsSelect
                    label="Include Tags"
                    value={searchCtx.include}
                    onChange={(event, value, reason) => {
                        updateSearchCtx({ include: value })
                    }}
                />
                <TagsSelect
                    label="Exclude Tags"
                    value={searchCtx.exclude}
                    onChange={(event, value, reason) => {
                        updateSearchCtx({ exclude: value })
                    }}
                />
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
            </Stack>
        </Paper>
    )
}

function MainSearchField() {
    const { searchCtx } = React.useContext(Contexts.Search)
    const { activeUrl, setActiveUrl } = React.useContext(Contexts.ActiveUrl)
    const { config, updateConfig } = React.useContext(Contexts.Config)
    const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null)
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
                style={{
                    width: '100%' as const,
                    marginTop: '3px' as const,
                }}
                freeSolo
                value={activeUrl}
                options={Object.keys(config ? config.hosts : {})}
                disableClearable
                onChange={async (event: any, value: any, reason: string) => {
                    if (!value) return
                    switch (reason) {
                        case 'create-option':
                            /*if (config && !config.hosts[value]) {
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
                        }*/
                            setActiveUrl(value)
                            break
                        case 'select-option':
                            // TODO: update hash list
                            setActiveUrl(value)
                            break
                        case 'remove-option':
                            config && setActiveUrl(config?.baseUrl)
                            /*if (
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
                        }*/
                            break
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
                                        size="small"
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

export default function SideBarHeader({
    notifyItems,
}: {
    notifyItems: () => void
}) {
    const theme = useTheme()
    const { selected } = React.useContext(Contexts.SidebarItemsSelected)
    const { searchCtx } = React.useContext(Contexts.Search)
    const { config } = React.useContext(Contexts.Config)
    const { activeUrl } = React.useContext(Contexts.ActiveUrl)
    const client = useApolloClient()
    const { authorization, deleteableItems } = React.useMemo(() => {
        if (!config) {
            return { authorization: [], deleteableItems: [] }
        }
        const deleteableItems: string[] = []
        const clusters = new Set<string>()
        const contents = new Set<string>()
        selected.forEach((val) => {
            const m = val.match(/.*(contents|clusters)::([a-zA-Z0-9=]+?)$/)
            if (!m) {
                return
            }
            deleteableItems.push(m[2])
            if (m[1] == 'contents') {
                contents.add(m[2])
            } else {
                clusters.add(m[2])
            }
        })
        return {
            authorization: authInfoFromConfig({
                config,
                url: activeUrl,
                require: new Set(['delete', 'manage']),
                clusters,
                contents,
            }).tokens,
            deleteableItems,
        }
    }, [config, activeUrl, selected])

    return (
        <>
            <Stack
                direction="row"
                alignItems="center"
                justifyContent="flex-end"
                spacing={1}
                style={{
                    // necessary for content to be below app bar
                    minHeight: theme.mixins.toolbar.minHeight,
                }}
            >
                {theme.direction === 'rtl' ? <CloseButton /> : null}
                <MainSearchField />
                {theme.direction === 'ltr' ? <CloseButton /> : null}
            </Stack>
            <div>
                <Button
                    disabled={!deleteableItems.length}
                    onClick={async () => {
                        if (searchCtx.deleted) {
                            await resetDeletionNodes({
                                client,
                                authorization,
                                ids: deleteableItems,
                            })
                        } else {
                            await deleteNodes({
                                client,
                                authorization,
                                ids: deleteableItems,
                            })
                        }
                        notifyItems()
                    }}
                >
                    {searchCtx.deleted ? 'Restore selected' : 'Delete selected'}
                </Button>
            </div>
        </>
    )
}
