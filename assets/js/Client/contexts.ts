import { ApolloClient } from '@apollo/client'
import { Color } from '@material-ui/lab/Alert'
import { Context, createContext } from 'react'

import * as Interfaces from './interfaces'

function stubFn() {}

/**export const VisibleStateContext = createContext({
    visibility: 'default' as 'default' | 'draft' | 'public' | 'internal',
    updateVisibility: (
        update: 'default' | 'draft' | 'public' | 'internal'
    ) => {},
})*/
export const Main = createContext<{
    mainCtx: Interfaces.MainContextInterface
    updateMainCtx: (update: Partial<Interfaces.MainContextInterface>) => void
}>({
    mainCtx: {
        action: 'start',
        title: '',
        item: null,
        updateId: null,
        url: null,
        type: '',
        shareUrl: null,
        deleted: null,
        tokens: [],
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

export const OpenSidebar = createContext<{
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
    message: { severity: Color; message: string } | undefined
    sendMessage: (arg: { severity: Color; message: string } | undefined) => void
}>({
    message: undefined,
    sendMessage: stubFn,
})
