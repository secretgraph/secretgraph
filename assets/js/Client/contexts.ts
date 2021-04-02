import { ApolloClient } from '@apollo/client'
import { Context, createContext } from 'react'

import * as Interfaces from './interfaces'

/**export const VisibleStateContext = createContext({
    visibility: 'default' as 'default' | 'draft' | 'public' | 'internal',
    updateVisibility: (
        update: 'default' | 'draft' | 'public' | 'internal'
    ) => {},
})*/
export const Main = createContext({
    mainCtx: { title: '' } as Interfaces.MainContextInterface,
    updateMainCtx: (update: Partial<Interfaces.MainContextInterface>) => {},
})
export const Search = createContext({
    searchCtx: {} as Interfaces.SearchContextInterface,
    updateSearchCtx: (update: Partial<Interfaces.SearchContextInterface>) => {},
})
export const Config = createContext({
    config: null as Interfaces.ConfigInterface | null,
    updateConfig: (
        update: Interfaces.ConfigInputInterface | null,
        replace?: boolean
    ) => {},
})
export const InitializedConfig = Config as Context<{
    config: Interfaces.ConfigInterface
    updateConfig: React.ContextType<typeof Config>['updateConfig']
}>

export const ActiveUrl = createContext({
    activeUrl: '' as string,
    setActiveUrl: (update: string) => {},
})

export const OpenSidebar = createContext({
    open: false,
    setOpen: (arg: boolean) => {},
})

export const SidebarItemsSelected = createContext({
    selected: [] as string[],
    setSelected: (arg0: string[]) => {},
})
export const SidebarItemsExpanded = createContext({
    expanded: [] as string[],
    setExpanded: (arg0: string[]) => {},
})

export const Clients = createContext(
    {} as {
        baseClient: ApolloClient<any>
        navClient: ApolloClient<any>
        itemClient: ApolloClient<any>
    }
)
