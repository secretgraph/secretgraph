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
    updateActiveUrl: (update: string) => {},
})

export const OpenSidebar = createContext({
    open: false,
    updateOpen: (arg: boolean) => {},
})
