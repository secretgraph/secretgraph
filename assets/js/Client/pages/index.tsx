import * as React from "react";
import { Theme } from "@material-ui/core/styles";
import ActionBar from "../components/ActionBar";
import HeaderBar from "../components/HeaderBar";
import SideBar from "../components/SideBar";
import { themeComponent } from "../theme";
import { elements } from '../components/elements';
import Help from './Help';
import DocumentEditor from './DocumentEditor';
import DocumentViewer from './DocumentViewer';


type Props = {
  classes: any,
  theme: Theme
};

export default themeComponent((props: Props) => {
  const {classes, theme} = props;
  const [drawerOpen, setDrawerOpen] = React.useState(true);
  const [mainContext, setMainContext] = React.useState({
    "component": null,
    "action": "add",
    "item": elements.keys().next().value,
    "state": "draft"
  });
  let frameElement = null;
  switch(mainContext.action){
    case "view":
      frameElement = (
        <DocumentViewer
          mainContext={mainContext}
          setMainContext={setMainContext}
        />
      );
      break;
    case "add":
    case "update":
      frameElement = (
        <DocumentEditor
          mainContext={mainContext}
          setMainContext={setMainContext}
        />
      );
      break;
    default:
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
        openState={{drawerOpen, setDrawerOpen}}
        mainContext={mainContext}/>
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
});
