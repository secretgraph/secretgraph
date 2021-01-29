import { createContext, Context } from 'react'
import {
    MainContextInterface,
    SearchContextInterface,
    ConfigInterface,
    ConfigInputInterface,
} from './interfaces'
/**export const VisibleStateContext = createContext({
    visibility: 'default' as 'default' | 'draft' | 'public' | 'internal',
    updateVisibility: (
        update: 'default' | 'draft' | 'public' | 'internal'
    ) => {},
})*/
export const MainContext = createContext({
    mainCtx: {} as MainContextInterface,
    updateMainCtx: (update: Partial<MainContextInterface>) => {},
})
export const SearchContext = createContext({
    searchCtx: {} as SearchContextInterface,
    updateSearchCtx: (update: Partial<SearchContextInterface>) => {},
})
export const ConfigContext = createContext({
    config: null as ConfigInterface | null,
    updateConfig: (update: ConfigInputInterface | null) => {},
})
export const InitializedConfigContext = ConfigContext as Context<{
    config: ConfigInterface
    updateConfig: (update: Partial<ConfigInputInterface> | null) => void
}>

export const ActiveUrlContext = createContext({
    activeUrl: '' as string,
    updateActiveUrl: (update: string) => {},
})
