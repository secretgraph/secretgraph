
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
import Accordion from '@material-ui/core/Accordion';
import AccordionDetails from '@material-ui/core/AccordionDetails';
import AccordionSummary from '@material-ui/core/AccordionSummary';
import DescriptionIcon from '@material-ui/icons/Description';
import GroupWorkIcon from '@material-ui/icons/GroupWork';
import MovieIcon from '@material-ui/icons/Movie';
import { parse, graph } from 'rdflib';
import ListItem from "@material-ui/core/ListItem";
import ListItemIcon from "@material-ui/core/ListItemIcon";
import ListItemText from "@material-ui/core/ListItemText";
import InboxIcon from "@material-ui/icons/MoveToInbox";
import MailOutlineIcon from '@material-ui/icons/MailOutline';
import DraftsIcon from '@material-ui/icons/Drafts';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import { Theme } from "@material-ui/core/styles";
import { themeComponent } from "../../theme";
import { ConfigInterface, MainContextInterface, SearchContextInterface } from "../../interfaces";
import { MainContext, SearchContext } from "../../contexts";
import { elements } from "../elements";
import { extract_authkeys } from "../../utils/config"
import { CapturingSuspense } from "../misc";
const SideBarClusters = React.lazy(() => import("./clusters"));
const SideBarContents = React.lazy(() => import("./contents"));


type SideBarProps = {
  openState: any,
  classes: any,
  theme: Theme,
  mainCtx: MainContextInterface,
  setMainCtx: any,
  searchCtx: SearchContextInterface,
  config: ConfigInterface
};

type SideBarHeaderProps = {
  classes: any,
  theme: Theme,
  closeButton: any
};


type SideBarControlProps = {
  classes: any,
  theme: Theme,
  config: ConfigInterface
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


const SideBarControl = themeComponent((props: SideBarControlProps) => {
  const { classes, theme } = props;
  const { mainCtx, setMainCtx } = React.useContext(MainContext)
  const { searchCtx, setSearchCtx } = React.useContext(SearchContext)
  return (
    <Accordion>
      <AccordionSummary
        expandIcon={<ExpandMoreIcon />}
        aria-controls="Control-content"
        id="Control-header"
      >
        <Typography className={classes.heading}>Control</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <List>
          <ListItem button key={"Inbox"} onClick={() => {
            setMainCtx({
              ...mainCtx,
              action: "view",
              item: "content",
            });
            setSearchCtx({
              ...searchCtx,
              filter: ["type=Message"],
              exclude: []
            });
          }}>
            <ListItemIcon>
              <InboxIcon />
            </ListItemIcon>
            <ListItemText primary={"Inbox"} />
          </ListItem>
          <ListItem button key={"Send"} onClick={() =>  {
            setMainCtx({
              ...mainCtx,
              action: "add",
              item: "Message",
            });
            setSearchCtx({
              ...searchCtx,
              filter: ["type=Message", "state=draft"],
              exclude: []
            });
          }}>
            <ListItemIcon>
              <MailOutlineIcon />
            </ListItemIcon>
            <ListItemText primary={"Send"} />
          </ListItem>
          <ListItem button key={"Drafts"} onClick={() =>  {
            setMainCtx({
              ...mainCtx,
              action: "edit",
              item: "content",
            });
            setSearchCtx({
              ...searchCtx,
              filter: ["type=Message", "state=draft"],
              exclude: []
            });
          }}>
            <ListItemIcon>
              <DraftsIcon />
            </ListItemIcon>
            <ListItemText primary={"Drafts"} />
          </ListItem>
          <ListItem button key={"Cluster"} onClick={() =>  {
            setMainCtx({
              ...mainCtx,
              action: "edit",
              item: "cluster",
            });
            setSearchCtx({
              ...searchCtx,
              filter: [],
              exclude: []
            });
          }}>
            <ListItemIcon>
              <GroupWorkIcon />
            </ListItemIcon>
            <ListItemText primary={"Cluster"} />
          </ListItem>
        </List>
      </AccordionDetails>
    </Accordion>
  );
});


class SideBar extends React.Component<SideBarProps> {
  render(){
    const { classes, theme, openState, config, mainCtx, setMainCtx, searchCtx} = this.props;
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
    let sideBarItems = null;
    if (config){
      const authkeys = extract_authkeys(config, searchCtx.activeUrl);
      if(mainCtx.item == "cluster"){
        sideBarItems = (
          <SideBarClusters
            activeUrl={searchCtx.activeUrl}
            authkeys={authkeys}
            setItem={
              (cluster: any) => setMainCtx({
                ...mainCtx,
                item: cluster.id,
                action: "view"
              })
            }
          />
        );
      } else {
        sideBarItems = (
          <SideBarContents
            searchCtx={searchCtx}
            authkeys={authkeys}
            setItem={
              (node: any) => setMainCtx({
                ...mainCtx,
                item: node.id,
                action: "view"
              })
            }
          />
        );
      }
    }
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
          <SideBarControl/>
          <List>
          <CapturingSuspense>
            {sideBarItems}
          </CapturingSuspense>
          </List>
        </div>
      </Drawer>
    );
  }

  componentDidCatch(error: any, info: any) {
    console.error(error, info);
  }
}

export default themeComponent(SideBar);
