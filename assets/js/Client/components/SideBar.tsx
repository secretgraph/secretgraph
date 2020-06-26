
import * as React from "react";
import Drawer from '@material-ui/core/Drawer';
import List from "@material-ui/core/List";
import Typography from "@material-ui/core/Typography";
import TextField from '@material-ui/core/TextField';
import Hidden from '@material-ui/core/Hidden';
import Divider from "@material-ui/core/Divider";
import IconButton from "@material-ui/core/IconButton";
import Autocomplete from '@material-ui/lab/Autocomplete';
import ChevronLeftIcon from "@material-ui/icons/ChevronLeft";
import ChevronRightIcon from "@material-ui/icons/ChevronRight";
import ExpansionPanel from '@material-ui/core/ExpansionPanel';
import ExpansionPanelDetails from '@material-ui/core/ExpansionPanelDetails';
import ExpansionPanelSummary from '@material-ui/core/ExpansionPanelSummary';
import StarIcon from '@material-ui/icons/Star';
import ListItem from "@material-ui/core/ListItem";
import ListItemIcon from "@material-ui/core/ListItemIcon";
import ListItemText from "@material-ui/core/ListItemText";
import InboxIcon from "@material-ui/icons/MoveToInbox";
import MailOutlineIcon from '@material-ui/icons/MailOutline';
import DraftsIcon from '@material-ui/icons/Drafts';
import MailIcon from "@material-ui/icons/Mail";
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import { Theme } from "@material-ui/core/styles";
import { themeComponent } from "../theme";
import { ConfigInterface, MainContextInterface } from "../interfaces";

type SideBarProps = {
  openState: any,
  classes: any,
  theme: Theme,
  mainContext: MainContextInterface,
  setMainContext: any,
  config: ConfigInterface
};

type SideBarHeaderProps = {
  classes: any,
  theme: Theme,
  closeButton: any
};


type SideBarPostboxProps = {
  classes: any,
  theme: Theme,
  config: ConfigInterface,
  mainContext: MainContextInterface,
  setMainContext: any
};

type SideBarItemsProps = {
  classes: any,
  theme: Theme,
  config: ConfigInterface,
  mainContext: any
};

const SideBarHeader = themeComponent((props: SideBarHeaderProps) => {
  const { classes, theme, closeButton } = props;
  const headerElements = (
    <Autocomplete
      className={classes.sideBarHeaderSelect}
      options={[]}
      renderInput={(params) => (
        <TextField
          {...params}
          label="Search content"
          variant="outlined"
          inputProps={{
            ...params.inputProps,
            autoComplete: 'new-password', // disable autocomplete and autofill
          }}
        />
      )}
    />
  );
  return (
    <div className={classes.sideBarHeader}>
      {theme.direction === "ltr" ? headerElements: null}
      {closeButton}
      {theme.direction === "rtl" ? headerElements: null}
    </div>
  )
})


const SideBarPostbox = themeComponent((props: SideBarPostboxProps) => {
  const { classes, theme, config, setMainContext, mainContext } = props;
  return (
    <ExpansionPanel>
      <ExpansionPanelSummary
        expandIcon={<ExpandMoreIcon />}
        aria-controls="PostBox-content"
        id="PostBox-header"
      >
        <Typography className={classes.heading}>PostBox</Typography>
      </ExpansionPanelSummary>
      <ExpansionPanelDetails>
        <List>
          <ListItem button key={"Inbox"} onClick={() => setMainContext({
            ...mainContext,
            item: "Message",
            action: "view",
            subaction: "inbox",
            filter: ["type=Message"],
            exclude: []
          })}>
            <ListItemIcon>
              <InboxIcon />
            </ListItemIcon>
          </ListItem>
          <ListItem button key={"Outbox"} onClick={() => setMainContext({
            ...mainContext,
            item: "Message",
            action: "edit",
            subaction: "drafts",
            filter: ["type=Message", "state=draft"],
            exclude: []
          })}>
            <ListItemIcon>
              <MailIcon />
            </ListItemIcon>
          </ListItem>
          <ListItem button key={"Drafts"} onClick={() => setMainContext({
            ...mainContext,
            item: "Message",
            action: "edit",
            subaction: "drafts",
            filter: ["type=Message", "state=draft"],
            exclude: []
          })}>
            <ListItemIcon>
              <DraftsIcon />
            </ListItemIcon>
          </ListItem>
        </List>
      </ExpansionPanelDetails>
    </ExpansionPanel>
  );
});


const SideBarItems = themeComponent((props: SideBarItemsProps) => {
  const { classes, theme, config } = props;
  return (
    <List>
      <ListItem button key={"Starred"}>
        <ListItemIcon>
          <StarIcon />
        </ListItemIcon>
      </ListItem>
      {["All mail", "Trash", "Spam", "l2", "l", "l13", "Öösdsd"].map((text, index) => (
        <ListItem button key={text}>
          <ListItemIcon>
            {index % 2 === 0 ? <InboxIcon /> : <MailIcon />}
          </ListItemIcon>
          <ListItemText primary={text} />
        </ListItem>
      ))}
    </List>
  );
})



function SideBar(props: SideBarProps) {
    const { classes, theme, openState, mainContext, setMainContext, config } = props;
    const closeButton = (
      <Hidden lgUp>
        <IconButton onClick={() => openState.setDrawerOpen(false)}>
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
        open={openState.drawerOpen}
        classes={{
          paper: classes.drawerPaper,
        }}
      >
        <SideBarHeader closeButton={closeButton} />
        <Divider />
        <div className={classes.sideBarBody}>
          <SideBarPostbox
            mainContext={mainContext}
            config={config}
          />
          <SideBarItems
            mainContext={mainContext}
            config={config}
          />
        </div>
      </Drawer>

    );
}

export default themeComponent(SideBar);
