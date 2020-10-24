import * as React from "react";
import { ApolloProvider } from "@apollo/client";;
import ActionBar from "../components/ActionBar";
import HeaderBar from "../components/HeaderBar";
import { useStylesAndTheme } from "../theme";
import { elements } from '../components/elements';
import { loadConfigSync } from '../utils/config';
import { createClient } from '../utils/graphql';
import { MainContextInterface, SearchContextInterface, ElementEntryInterface } from '../interfaces';
import { MainContext, SearchContext, ConfigContext, ActiveUrlContext } from '../contexts';
import SideBar from '../components/SideBar';
import { CapturingSuspense } from '../components/misc';
// const SideBar = React.lazy(() => import('../components/SideBar'));
const SettingsImporter = React.lazy(() => import('./SettingsImporter'));
const Help = React.lazy(() => import('./Help'));

type Props = {
  defaultPath?: string
};



function MainPage(props: Props) {
  const {defaultPath} = props;
  const {classes, theme} = useStylesAndTheme();
  const [drawerOpen, setDrawerOpen] = React.useState(true);
  const [shareUrl, setShareUrl] = React.useState(null) as [string | null, any];
  const [config, setConfig] = React.useState(() => loadConfigSync());
  const [mainCtx, setMainCtx] = React.useState({
    "action": config ? "add" : "start",
    "state": "default",
    "title": null,
    "item": null,
    "url": null,
    "type": elements.keys().next().value
  } as MainContextInterface);
  const [searchCtx, setSearchCtx] = React.useState({
    "cluster": null,
    "include": [],
    "exclude": []
  } as SearchContextInterface);
  const [activeUrl, setActiveUrl] = React.useState(() => (config ? config.baseUrl : defaultPath) as string)
  let frameElement = null;
  switch(mainCtx.action){
    case "view":
    case "add":
    case "update":
      let FrameElementWrapper = elements.get(mainCtx.type ? mainCtx.type : "undefined");
      if (!FrameElementWrapper){
        FrameElementWrapper = elements.get("undefined") as ElementEntryInterface;
      }
      const FrameElementType = (FrameElementWrapper as ElementEntryInterface).component;
      if (activeUrl == mainCtx.url || !mainCtx.url){
        frameElement = (
          <FrameElementType
            setShareUrl={setShareUrl}
          />
        );
      } else {
        frameElement = (
          <ApolloProvider client={createClient(mainCtx.url as string)}>
            <FrameElementType
              setShareUrl={setShareUrl}
            />
          </ApolloProvider>
        );
      }
      break;
    case "start":
    case "import":
      frameElement = (
        <SettingsImporter/>
      );
      break;
    case "help":
      frameElement = (
        <Help/>
      );
      break;
  }
  return (
    <ActiveUrlContext.Provider value={{activeUrl, setActiveUrl}}>
      <MainContext.Provider value={{mainCtx, setMainCtx}}>
        <SearchContext.Provider value={{searchCtx, setSearchCtx}}>
          <ConfigContext.Provider value={{config, setConfig}}>
            <ApolloProvider client={createClient(activeUrl)}>
              <div className={classes.root}>
                <SideBar
                  openState={{drawerOpen, setDrawerOpen}}
                />
                <div className={classes.subRoot}>
                  <HeaderBar
                    openState={{drawerOpen: !!(drawerOpen && config), setDrawerOpen}}
                  />
                  <main className={classes.content}>
                    <ActionBar
                      shareUrl={mainCtx.item && shareUrl ? shareUrl : null}
                    />
                    <section className={classes.mainSection}>
                      <CapturingSuspense>
                        {frameElement}
                      </CapturingSuspense>
                    </section>
                  </main>
                </div>
              </div>
            </ApolloProvider>
          </ConfigContext.Provider>
        </SearchContext.Provider>
      </MainContext.Provider>
    </ActiveUrlContext.Provider>
  );
};


export default MainPage;
