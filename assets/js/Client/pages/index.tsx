import * as React from "react";
import { Theme } from "@material-ui/core/styles";
import ActionBar from "../components/ActionBar";
import HeaderBar from "../components/HeaderBar";
import SideBar from "../components/SideBar";
import { themeComponent } from "../theme";
import { elements } from '../components/elements';
import { loadConfigSync } from '../utils/config';
import Help from './Help';
import SettingsImporter from './SettingsImporter';
import DocumentEditor from './DocumentEditor';
import DocumentViewer from './DocumentViewer';
import { createEnvironment } from '../utils/graphql'

type Props = {
  classes: any,
  theme: Theme
};


function MainPage(props: Props) {
  const {classes, theme} = props;
  const [drawerOpen, setDrawerOpen] = React.useState(true);
  const [config, setConfig] = React.useState(() => loadConfigSync());
  const [mainContext, setMainContext] = React.useState({
    "component": null,
    "action": config ? "add" : "start",
    "item": elements.keys().next().value,
    "state": "draft",
    "environment": config ? createEnvironment(config.baseUrl) : null
  });
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
        <DocumentEditor
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

  return (
    <div className={classes.root}>
      <HeaderBar
        config={config}
        setConfig={setConfig}
        openState={{drawerOpen, setDrawerOpen}}
        mainContext={mainContext}
        setMainContext={setMainContext}/>
      <SideBar
        mainContext={mainContext}
        setMainContext={setMainContext}
        openState={{drawerOpen, setDrawerOpen}}
      />
      <main className={drawerOpen ? classes.contentShift : classes.content}>
        <ActionBar
          mainContext={mainContext}
          setMainContext={setMainContext}
        />
        <section className={classes.mainSection}>
          {frameElement}
        </section>
      </main>
    </div>
  );
};
export default themeComponent(MainPage);
