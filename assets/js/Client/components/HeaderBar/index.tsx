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
  drawerOpener: any,
  classes: any,
  theme: Theme
};


class HeaderBar extends React.Component<Props> {
  render() {
    const { classes, theme } = this.props;
    return (
      <AppBar position="static">
        <Toolbar>
          <IconButton
            edge="start"
            className={classes.menuButton}
            onClick={this.props.drawerOpener}
            color="inherit"
            aria-label="menu"
          >
            <MenuIcon />
          </IconButton>
          <IconButton
            edge="end"
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
}


export default themeComponent(HeaderBar);
