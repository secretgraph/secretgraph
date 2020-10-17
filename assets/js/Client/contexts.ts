import {createContext, Context} from "react";
import { MainContextInterface, SearchContextInterface, ConfigInterface } from './interfaces';

export const MainContext = <unknown>createContext(undefined) as Context<{mainCtx: MainContextInterface, setMainCtx: any}>;
export const ActiveUrlContext = <unknown>createContext(undefined) as Context<{activeUrl: string, setActiveUrl: any}>;
export const SearchContext = <unknown>createContext(undefined) as Context<{searchCtx: SearchContextInterface, setSearchCtx: any}>;
export const ConfigContext = <unknown>createContext(undefined) as Context<{config: ConfigInterface | null, setConfig: any} >;
export const InitializedConfigContext = ConfigContext as Context<{config: ConfigInterface, setConfig: any} >;
