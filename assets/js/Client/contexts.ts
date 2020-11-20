import {createContext, Context} from "react";
import { MainContextInterface, SearchContextInterface, ConfigInterface } from './interfaces';

export const MainContext = createContext({
    mainCtx: {} as MainContextInterface,
    updateMainCtx: (update: Partial<MainContextInterface>) => {}
});
export const SearchContext = createContext({
    searchCtx: {} as SearchContextInterface,
    updateSearchCtx: (update: Partial<SearchContextInterface>) => {}
});
export const ConfigContext = createContext({
    config: null as (ConfigInterface | null),
    updateConfig: (update: Partial<ConfigInterface> | null) => {}
});
export const InitializedConfigContext = ConfigContext as Context<{config: ConfigInterface, updateConfig: (update: Partial<ConfigInterface> | null) => void} >;

export const ActiveUrlContext = createContext({
    activeUrl: "" as string,
    updateActiveUrl: (update: string) => {}
});
