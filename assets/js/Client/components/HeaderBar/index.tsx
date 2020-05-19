import * as React from "react";
import AppBar from "@material-ui/core/AppBar";
import Toolbar from "@material-ui/core/Toolbar";
import Typography from "@material-ui/core/Typography";
import Button from "@material-ui/core/Button";
import MenuItem from "@material-ui/core/MenuItem";
import Menu from "@material-ui/core/Menu";
import IconButton from "@material-ui/core/IconButton";
import MenuIcon from "@material-ui/icons/Menu";
import AccountCircle from "@material-ui/icons/AccountCircle";
import { Theme } from "@material-ui/core/styles";

import { themeComponent } from "../../theme";

type Props = {
  open: boolean,
  setDrawerOpen: any,
  classes: any,
  theme: Theme,
  title: string
};


function HeaderBar(props: Props) {
  const { classes, theme, title, open, setDrawerOpen } = props;
  let menuButton = null;
  if (!open){
    menuButton = (
      <IconButton
        edge="start"
        className={classes.menuButton}
        onClick={() => setDrawerOpen(true)}
        color="inherit"
        aria-label="menu"
      >
        <MenuIcon />
      </IconButton>
    )
  }
  return (
    <AppBar
      position="sticky"
      className={open ? classes.appBarShift : classes.appBar}
    >
      <Toolbar className={classes.appBarToolBar}>
        {menuButton}
        <Typography variant="h6" className={classes.appBarTitle}>
          {title}
        </Typography>
        <IconButton
          edge="start"
          className={classes.userButton}
          color="inherit"
          aria-label="user"
        >
          <AccountCircle />
        </IconButton>
      </Toolbar>
    </AppBar>
  );
}


export default themeComponent(HeaderBar);
