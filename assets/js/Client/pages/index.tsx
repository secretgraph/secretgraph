import * as React from "react";
import { graphql, QueryRenderer } from "react-relay";
import { environment } from "../environment";
import ActionBar from "../components/ActionBar";
import HeaderBar from "../components/HeaderBar";
import SideBar from "../components/SideBar";
import { themeComponent } from "../theme";
import { Theme } from "@material-ui/core/styles";

type Props = {
  classes: any,
  theme: Theme
};

export default themeComponent((props: Props) => {
  const {classes, theme} = props;
  const [drawerOpen, setDrawerOpen] = React.useState(true);
  const [action, setAction] = React.useState("add");
  const [currentItem, setCurrentItem] = React.useState("");
  const [currentItemState, setCurrentItemState] = React.useState("draft");
  return (
    <div className={classes.root}>
      <HeaderBar openState={{drawerOpen, setDrawerOpen}} title={`${}`} />
      <SideBar
        sidebarHandler=""
        currentItem={{currentItem, setCurrentItem}}
        openState={{drawerOpen, setDrawerOpen}}
      />
      <main className={drawerOpen ? classes.contentShift : classes.content}>
        <ActionBar
          currentItem={{currentItem, setCurrentItem}}
          currentItemState={{currentItemState, setCurrentItemState}}
          action={{action, setAction}}
        />
        <section className={classes.mainSection}>
        </section>
      </main>
    </div>
  );
});
