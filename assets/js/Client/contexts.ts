import { Context, createContext } from 'react'

import {
    ConfigInputInterface,
    ConfigInterface,
    MainContextInterface,
    SearchContextInterface,
} from './interfaces'

/**export const VisibleStateContext = createContext({
    visibility: 'default' as 'default' | 'draft' | 'public' | 'internal',
    updateVisibility: (
        update: 'default' | 'draft' | 'public' | 'internal'
    ) => {},
})*/
export const MainContext = createContext({
    mainCtx: { title: '' } as MainContextInterface,
    updateMainCtx: (update: Partial<MainContextInterface>) => {},
})
export const SearchContext = createContext({
    searchCtx: {} as SearchContextInterface,
    updateSearchCtx: (update: Partial<SearchContextInterface>) => {},
})
export const ConfigContext = createContext({
    config: null as ConfigInterface | null,
    updateConfig: (
        update: ConfigInputInterface | null,
        replace?: boolean
    ) => {},
})
export const InitializedConfigContext = ConfigContext as Context<{
    config: ConfigInterface
    updateConfig: React.ContextType<typeof ConfigContext>['updateConfig']
}>

export const ActiveUrlContext = createContext({
    activeUrl: '' as string,
    updateActiveUrl: (update: string) => {},
})
