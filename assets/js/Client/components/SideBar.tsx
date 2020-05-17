
import * as React from "react";
import Drawer from '@material-ui/core/Drawer';
import List from "@material-ui/core/List";
import Typography from "@material-ui/core/Typography";
import Hidden from '@material-ui/core/Hidden';
import Divider from "@material-ui/core/Divider";
import IconButton from "@material-ui/core/IconButton";
import MenuIcon from "@material-ui/icons/Menu";
import CreatableSelect from 'react-select/creatable';
import ChevronLeftIcon from "@material-ui/icons/ChevronLeft";
import ChevronRightIcon from "@material-ui/icons/ChevronRight";
import ExpansionPanel from '@material-ui/core/ExpansionPanel';
import ExpansionPanelDetails from '@material-ui/core/ExpansionPanelDetails';
import ExpansionPanelSummary from '@material-ui/core/ExpansionPanelSummary';
import ListItem from "@material-ui/core/ListItem";
import ListItemIcon from "@material-ui/core/ListItemIcon";
import ListItemText from "@material-ui/core/ListItemText";
import InboxIcon from "@material-ui/icons/MoveToInbox";
import MailIcon from "@material-ui/icons/Mail";
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import { Theme } from "@material-ui/core/styles";
import { themeComponent } from "../theme";

type SideBarProps = {
  sidebarHandler: any,
  open: boolean,
  setDrawerOpen: any,
  classes: any,
  theme: Theme
};

type SideBarHeaderProps = {
  classes: any,
  theme: Theme,
  closeButton: any
};

const SideBarHeader = themeComponent((props: SideBarHeaderProps) => {
  const { classes, theme, closeButton } = props;
  const headerElements = (
    <CreatableSelect
        className={classes.drawerHeaderSelect}
    />
  );
  return (
    <div className={classes.drawerHeader}>
      {theme.direction === "ltr" ? headerElements: null}
      {closeButton}
      {theme.direction !== "ltr" ? headerElements: null}
    </div>
  )
})

function SideBar (props: SideBarProps) {
    const { classes, theme, sidebarHandler, open, setDrawerOpen } = props;
    const closeButton = (
      <Hidden lgUp>
        <IconButton onClick={() => setDrawerOpen(false)}>
          {theme.direction === "ltr" ? (
            <ChevronLeftIcon />
          ) : (
            <ChevronRightIcon />
          )}
        </IconButton>
      </Hidden>
    );
    return (
      <Drawer
        className={classes.drawer}
        variant="persistent"
        anchor={theme.direction === 'ltr' ? 'left' : 'right'}
        open={open}
        classes={{
          paper: classes.drawerPaper,
        }}
      >
        <SideBarHeader closeButton={closeButton} />
        <Divider />
        <ExpansionPanel>
          <ExpansionPanelSummary
            expandIcon={<ExpandMoreIcon />}
            aria-controls="panel1a-content"
            id="panel1a-header"
          >
            <Typography className={classes.heading}>PostBox</Typography>
          </ExpansionPanelSummary>
          <ExpansionPanelDetails>
            <List>
            {["Inbox", "Starred", "Send email", "Drafts"].map(
              (text, index) => (
                <ListItem button key={text}>
                  <ListItemIcon>
                    {index % 2 === 0 ? (
                      <InboxIcon />
                    ) : (
                      <MailIcon />
                    )}
                  </ListItemIcon>
                  <ListItemText primary={text} />
                </ListItem>
              )
            )}
          </List>
          </ExpansionPanelDetails>
        </ExpansionPanel>
        <List>
          {["All mail", "Trash", "Spam"].map((text, index) => (
            <ListItem button key={text}>
              <ListItemIcon>
                {index % 2 === 0 ? <InboxIcon /> : <MailIcon />}
              </ListItemIcon>
              <ListItemText primary={text} />
            </ListItem>
          ))}
        </List>
      </Drawer>
    );
}

export default themeComponent(SideBar);
