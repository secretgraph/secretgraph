import { ApolloClient } from '@apollo/client'
import { AlertColor } from '@mui/material/Alert'
import * as Interfaces from '@secretgraph/misc/interfaces'
import { Context, createContext } from 'react'

function stubFn() {}

/**export const VisibleStateContext = createContext({
    visibility: 'default' as 'default' | 'draft' | 'public' | 'protected',
    updateVisibility: (
        update: 'default' | 'draft' | 'public' | 'protected'
    ) => {},
})*/
export const Main = createContext<{
    mainCtx: Interfaces.MainContextInterface
    updateMainCtx: (update: Partial<Interfaces.MainContextInterface>) => void
}>({
    mainCtx: {
        action: 'login',
        title: '',
        item: null,
        cluster: null,
        updateId: null,
        url: null,
        type: '',
        shareFn: null,
        deleted: null,
        // use tokens and permissions for saving items related tokens and permissions
        tokens: [],
        tokensPermissions: new Set(),
    },
    updateMainCtx: stubFn,
})
export const Search = createContext<{
    searchCtx: Interfaces.SearchContextInterface
    updateSearchCtx: (
        update: Partial<Interfaces.SearchContextInterface>
    ) => void
}>({
    searchCtx: {
        cluster: null,
        include: [],
        exclude: [],
        deleted: false,
    },
    updateSearchCtx: stubFn,
})
export const Config = createContext<{
    config: Interfaces.ConfigInterface | null
    updateConfig: (
        update: Interfaces.ConfigInputInterface | null,
        replace?: boolean
    ) => void
}>({
    config: null,
    updateConfig: stubFn,
})
export const InitializedConfig = Config as Context<{
    config: Interfaces.ConfigInterface
    updateConfig: React.ContextType<typeof Config>['updateConfig']
}>

export const ActiveUrl = createContext<{
    activeUrl: string
    setActiveUrl: (update: string) => void
}>({
    activeUrl: '',
    setActiveUrl: stubFn,
})

export const External = createContext<{
    defaultPath: string
    homeUrl?: string
    loginUrl: string
}>({ defaultPath: '', loginUrl: '' })

export const OpenSidebar = createContext<{
    open: boolean
    setOpen: (arg: boolean) => void
}>({
    open: false,
    setOpen: stubFn,
})

export const OpenConfigShare = createContext<{
    open: boolean
    setOpen: (arg: boolean) => void
}>({
    open: false,
    setOpen: stubFn,
})

export const SidebarItemsSelected = createContext<{
    selected: string[]
    setSelected: (arg: string[]) => void
}>({
    selected: [],
    setSelected: stubFn,
})
export const SidebarItemsExpanded = createContext<{
    expanded: string[]
    setExpanded: (arg: string[]) => void
}>({
    expanded: [],
    setExpanded: stubFn,
})

export const Clients = createContext(
    {} as {
        baseClient: ApolloClient<any>
        navClient: ApolloClient<any>
        itemClient: ApolloClient<any>
    }
)

export const Snackbar = createContext<{
    message: { severity: AlertColor; message: string } | undefined
    sendMessage: (
        arg: { severity: AlertColor; message: string } | undefined
    ) => void
}>({
    message: undefined,
    sendMessage: stubFn,
})