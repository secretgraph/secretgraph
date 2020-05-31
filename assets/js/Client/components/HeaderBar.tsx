import * as React from "react";
import AppBar from "@material-ui/core/AppBar";
import Toolbar from "@material-ui/core/Toolbar";
import Typography from "@material-ui/core/Typography";
import MenuItem from "@material-ui/core/MenuItem";
import Menu from "@material-ui/core/Menu";
import IconButton from "@material-ui/core/IconButton";
import MenuIcon from "@material-ui/icons/Menu";
import AccountCircle from "@material-ui/icons/AccountCircle";
import { Theme } from "@material-ui/core/styles";
import { Helmet } from 'react-helmet';

import { themeComponent } from "../theme";
import { elements } from './elements';

type Props = {
  openState: any,
  classes: any,
  theme: Theme,
  mainContext: any
};
const menuRef: React.RefObject<any> = React.createRef();


function HeaderBar(props: Props) {
  const { classes, theme, mainContext, openState } = props;
  const [menuOpen, setMenuOpen] = React.useState(false);
  let title;
  switch (mainContext.action){
    case "add":
      let temp = elements.get(mainContext.item);
      title = `Add: ${temp ? temp.label : 'unknown'}`;
      break;
    case "update":
      title = `Update: ${mainContext.item}`;
      break;
    case "help":
      title = `Help: ${mainContext.item}`;
      break;
    default:
      title = mainContext.item;
      break;

  }
  let sidebarButton = null;
  if (!openState.drawerOpen){
    sidebarButton = (
      <IconButton
        edge="start"
        className={classes.sidebarButton}
        onClick={() => openState.setDrawerOpen(true)}
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
      className={openState.drawerOpen ? classes.appBarShift : classes.appBar}
    >
      <Helmet>
        <title>{`Secretgraph: ${title}`}</title>
      </Helmet>
      <Toolbar className={classes.appBarToolBar}>
        {sidebarButton}
        <Typography variant="h6" className={classes.appBarTitle}>
          {title}
        </Typography>
        <IconButton
          edge="start"
          className={classes.userButton}
          color="inherit"
          aria-label="user"
          ref={menuRef}
          onClick={() => setMenuOpen(true)}
        >
          <AccountCircle />
        </IconButton>
        <Menu
          anchorEl={menuRef.current}
          anchorOrigin={{
            vertical: 'top',
            horizontal: 'right',
          }}
          transformOrigin={{
            vertical: 'top',
            horizontal: 'right',
          }}
          keepMounted
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
        >
          <MenuItem onClick={() => setMenuOpen(false)}>Update Settings</MenuItem>
          <MenuItem onClick={() => setMenuOpen(false)}>Load Settings</MenuItem>
          <MenuItem onClick={() => setMenuOpen(false)}>Export Settings</MenuItem>
          <MenuItem onClick={() => setMenuOpen(false)}>Help</MenuItem>
        </Menu>
      </Toolbar>
    </AppBar>
  );
}


export default themeComponent(HeaderBar);
