import * as React from "react";
import { ApolloProvider } from "@apollo/client";
import { Theme } from "@material-ui/core/styles";
import ActionBar from "../components/ActionBar";
import HeaderBar from "../components/HeaderBar";
import SideBar from "../components/SideBar";
import { themeComponent } from "../theme";
import { elements } from '../components/elements';
import { CapturingSuspense } from '../components/misc';
import { loadConfigSync } from '../utils/config';
import { createClient } from '../utils/graphql';
import { MainContextInterface, SearchContextInterface } from '../interfaces';
import { MainContext, SearchContext, ConfigContext } from '../contexts';
const SettingsImporter = React.lazy(() => import('./SettingsImporter'));
const Help = React.lazy(() => import('./Help'));
const DocumentViewer = React.lazy(() => import('./DocumentViewer'));
const DocumentForm = React.lazy(() => import('./DocumentForm'));

type Props = {
  classes: any,
  theme: Theme,
  defaultPath?: string
};



function MainPage(props: Props) {
  const {classes, theme, defaultPath} = props;
  const [drawerOpen, setDrawerOpen] = React.useState(true);
  const [config, setConfig] = React.useState(() => loadConfigSync());
  const [mainCtx, setMainCtx] = React.useState({
    "action": config ? "add" : "start",
    "item": elements.keys().next().value,
    "state": "draft",
    "title": null,
  } as MainContextInterface);
  const [searchCtx, setSearchCtx] = React.useState({
    "cluster": null,
    "include": [],
    "exclude": [],
    "activeUrl": config ? config.baseUrl : defaultPath
  } as SearchContextInterface);
  let frameElement = null;
  switch(mainCtx.action){
    case "view":
      frameElement = (
        <DocumentViewer
        />
      );
      break;
    case "add":
    case "update":
      frameElement = (
        <DocumentForm/>
      );
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
  let sidebar = null;
  if (config){
    sidebar = (
      <SideBar
        openState={{drawerOpen, setDrawerOpen}}
        searchCtx={searchCtx}
        mainCtx={mainCtx}
        setMainCtx={setMainCtx}
        config={config}
      />
    );
  }

  return (
    <MainContext.Provider value={{mainCtx, setMainCtx}}>
      <SearchContext.Provider value={{searchCtx, setSearchCtx}}>
        <ConfigContext.Provider value={{config, setConfig}}>
          <ApolloProvider client={createClient(searchCtx.activeUrl)}>
            <div className={classes.root}>
              <HeaderBar
                openState={{drawerOpen: (drawerOpen && config), setDrawerOpen}}
              />
              {sidebar}
              <main className={(drawerOpen && config) ? classes.contentShift : classes.content}>
                <ActionBar
                />
                <section className={classes.mainSection}>
                  <CapturingSuspense>
                    {frameElement}
                  </CapturingSuspense>
                </section>
              </main>
            </div>
          </ApolloProvider>
        </ConfigContext.Provider>
      </SearchContext.Provider>
    </MainContext.Provider>
  );
};


export default themeComponent(MainPage);
