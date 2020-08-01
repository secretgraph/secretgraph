import * as React from "react";
import { RelayEnvironmentProvider } from 'relay-hooks';
import { Theme } from "@material-ui/core/styles";
import CircularProgress from '@material-ui/core/CircularProgress';
import ActionBar from "../components/ActionBar";
import HeaderBar from "../components/HeaderBar";
import SideBar from "../components/SideBar";
import { themeComponent } from "../theme";
import { elements } from '../components/elements';
import { CapturingSuspense } from '../components/misc';
import { loadConfigSync } from '../utils/config';
import Help from './Help';
import SettingsImporter from './SettingsImporter';
import { DocumentViewer, DocumentForm } from './DocumentFrames';
import { createEnvironment } from '../utils/graphql';
import { MainContextInterface } from '../interfaces';

type Props = {
  classes: any,
  theme: Theme,
  defaultPath?: string
};


function MainPage(props: Props) {
  const {classes, theme, defaultPath} = props;
  const [drawerOpen, setDrawerOpen] = React.useState(true);
  const [config, setConfig] = React.useState(() => loadConfigSync());
  const [mainContext, setMainContext] = React.useState({
    "cluster": null,
    "action": config ? "add" : "start",
    "subaction": "",
    "include": [],
    "exclude": [],
    "item": elements.keys().next().value,
    "state": "draft",
    "activeUrl": config ? config.baseUrl : defaultPath
  } as MainContextInterface);
  let frameElement = null;
  switch(mainContext.action){
    case "view":
      frameElement = (
        <DocumentViewer
          mainContext={mainContext}
          setMainContext={setMainContext}
          config={config}
          setConfig={setConfig}
        />
      );
      break;
    case "add":
    case "update":
      frameElement = (
        <DocumentForm
          mainContext={mainContext}
          setMainContext={setMainContext}
          config={config}
          setConfig={setConfig}
        />
      );
      break;
    case "start":
    case "import":
      frameElement = (
        <SettingsImporter
          mainContext={mainContext}
          setMainContext={setMainContext}
          config={config}
          setConfig={setConfig}
        />
      );
      break;
    case "help":
      frameElement = (
        <Help
          mainContext={mainContext}
        />
      );
      break;
  }
  let sidebar = null;
  if (config){
    sidebar = (
      <SideBar
        config={config}
        mainContext={mainContext}
        setMainContext={setMainContext}
        openState={{drawerOpen, setDrawerOpen}}
      />
    );
  }

  return (
    <RelayEnvironmentProvider environment={createEnvironment(mainContext.activeUrl)}>
      <div className={classes.root}>
        <HeaderBar
          config={config}
          setConfig={setConfig}
          openState={{drawerOpen: (drawerOpen && config), setDrawerOpen}}
          mainContext={mainContext}
          setMainContext={setMainContext}
        />
        {sidebar}
        <main className={(drawerOpen && config) ? classes.contentShift : classes.content}>
          <ActionBar
            mainContext={mainContext}
            setMainContext={setMainContext}
          />
          <section className={classes.mainSection}>
            <CapturingSuspense>
              {frameElement}
            </CapturingSuspense>
          </section>
        </main>
      </div>
    </RelayEnvironmentProvider>
  );
};


export default themeComponent(MainPage);
