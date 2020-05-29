import * as React from "react";
import { Theme } from "@material-ui/core/styles";
import ActionBar from "../components/ActionBar";
import HeaderBar from "../components/HeaderBar";
import SideBar from "../components/SideBar";
import { themeComponent } from "../theme";
import { elements } from '../components/elements';

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
        </section>
      </main>
    </div>
  );
});
