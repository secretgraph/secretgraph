
import * as React from "react";
import Drawer from '@material-ui/core/Drawer';
import List from "@material-ui/core/List";
import Typography from "@material-ui/core/Typography";
import TextField from '@material-ui/core/TextField';
import Hidden from '@material-ui/core/Hidden';
import Divider from "@material-ui/core/Divider";
import IconButton from "@material-ui/core/IconButton";
import Button from '@material-ui/core/Button';
import Autocomplete from '@material-ui/lab/Autocomplete';
import Chip from '@material-ui/core/Chip';
import ChevronLeftIcon from "@material-ui/icons/ChevronLeft";
import ChevronRightIcon from "@material-ui/icons/ChevronRight";
import Collapse from '@material-ui/core/Collapse';
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
import { ConfigInterface } from "../../interfaces";
import { MainContext, SearchContext, ActiveUrlContext, ConfigContext } from "../../contexts";
import { elements } from "../elements";
import { extract_authinfo } from "../../utils/config"
import { CapturingSuspense } from "../misc";
const SideBarClusters = React.lazy(() => import("./clusters"));


type SideBarProps = {
  openState: any,
  classes: any,
  theme: Theme,
};

type SideBarHeaderProps = {
  classes: any,
  theme: Theme,
  closeButton: any,
  headerExpanded: boolean,
  setHeaderExpanded: any
};


type SideBarControlProps = {
  classes: any,
  theme: Theme,
  config: ConfigInterface
};

const SideBarHeader = themeComponent((props: SideBarHeaderProps) => {
  const { classes, theme, closeButton, headerExpanded, setHeaderExpanded } = props;
  const {activeUrl, setActiveUrl} = React.useContext(ActiveUrlContext);
  const { config, setConfig } = React.useContext(ConfigContext);
  const { searchCtx, setSearchCtx } = React.useContext(SearchContext);
  const headerElements = (
    <Autocomplete
      onFocus={() => setHeaderExpanded(true)}
      className={classes.sideBarHeaderSelect}
      freeSolo
      value={activeUrl}
      options={Object.keys(config ? config.clusters : {})}
      disableClearable
      onChange={(event: any, value: any, reason: string) => {
        if(!value) return;
        switch (reason) {
          case "create-option":
            if(config && !config.clusters[value]){
              const newConfig = {
                ...config,
                clusters: {
                  ...config.clusters
                }
              };
              newConfig.clusters[value] = {};
              setConfig(newConfig)
            }
            setActiveUrl(value);
            break;
          case "select-option":
            setActiveUrl(value);
            break;
          case "remove-option":
            if (config && config.clusters[value] && Object.keys(config.clusters[value]).length === 0){
              const newConfig = {
                ...config,
                clusters: {
                  ...config.clusters
                }
              };
              delete newConfig.clusters[value];
              setConfig(newConfig)
            }
        }
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label="Set Url"
          variant="outlined"
          size="small"
          margin="dense"
        />
      )}
    />
  );
  return (
    <React.Fragment>
      <div>
        <div className={classes.sideBarHeader}>
          {theme.direction === "ltr" ? headerElements: null}
          {closeButton}
          {theme.direction === "rtl" ? headerElements: null}
        </div>
        <Button
          className={classes.sideBarHeaderExpandButton}
          onClick={() => setHeaderExpanded(!headerExpanded)}
          size="small"
        >
          <ExpandMoreIcon
            className={headerExpanded ? classes.sideBarHeaderExpandButtonIconExpanded : classes.sideBarHeaderExpandButtonIcon}
          />
        </Button>
      </div>
      <Collapse in={headerExpanded} timeout="auto" unmountOnExit>
        <List>
          <ListItem>
            <Autocomplete
              multiple
              value={searchCtx.include}
              freeSolo
              fullWidth
              options={searchCtx.include}
              onChange={(event: any, value: any, reason: string) => {
                if(!value) return;
                setSearchCtx({...searchCtx, include:value});
              }}
              renderTags={(value: string[], getTagProps: any) =>
                value.map((option: string, index: number) => (
                  <Chip
                  size="small" variant="outlined" label={option} {...getTagProps({ index })} />
                ))
              }
              renderInput={(params: any) => (
                <TextField
                  {...params}
                  label="Include Tags"
                  variant="outlined"
                  size="small"
                  margin="dense"
                  multiline
                />
              )}
            />
          </ListItem>
          <ListItem>
            <Autocomplete
              multiple
              value={searchCtx.exclude}
              freeSolo
              fullWidth
              options={searchCtx.exclude}
              id="tags-excluded"
              onChange={(event: any, value: any, reason: string) => {
                if(!value) return;
                setSearchCtx({...searchCtx, exclude: value});
              }}
              renderTags={(value: string[], getTagProps: any) =>
                value.map((option: string, index: number) => (
                  <Chip size="small" variant="outlined" label={option} {...getTagProps({ index })} />
                ))
              }
              renderInput={(params: any) => (
                <TextField
                  {...params}
                  label="Exclude tags"
                  variant="outlined"
                  size="small"
                  margin="dense"
                  multiline
                  value={activeUrl}
                />
              )}
            />
          </ListItem>
        </List>
      </Collapse>
    </React.Fragment>
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
        <Typography className={classes.heading}>Shortcuts</Typography>
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


const SideBar = (props: SideBarProps) => {
  const { classes, theme, openState} = props;
  const {searchCtx, setSearchCtx} = React.useContext(SearchContext);
  const {activeUrl, setActiveUrl} = React.useContext(ActiveUrlContext);
  const { mainCtx, setMainCtx } = React.useContext(MainContext);
  const { config, setConfig } = React.useContext(ConfigContext);
  const [headerExpanded, setHeaderExpanded] = React.useState(false);
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
    const authinfo = extract_authinfo(config, activeUrl);
    sideBarItems = (
      <SideBarClusters
        authinfo={authinfo}
        activeCluster={searchCtx.cluster}
        setItemComponent={
          (cluster: any) => {
            setMainCtx({
              ...mainCtx,
              item: null,
              action: "view"
            });
            setSearchCtx({
              ...searchCtx,
              cluster: cluster.id
            });
            setHeaderExpanded(false);
          }
        }
        setItemContent={
          (content: any) => {
            setMainCtx({
              ...mainCtx,
              action: "view",
              item: content.id
            });
            setHeaderExpanded(false);
          }
        }
      />
    );
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
      <SideBarHeader
        closeButton={closeButton}
        headerExpanded={headerExpanded}
        setHeaderExpanded={setHeaderExpanded}
      />
      <Divider />
      <div className={classes.sideBarBody}>
        <List>
        <CapturingSuspense>
          {sideBarItems}
        </CapturingSuspense>
        </List>
        <SideBarControl/>
      </div>
    </Drawer>
  );
}

export default themeComponent(SideBar);
