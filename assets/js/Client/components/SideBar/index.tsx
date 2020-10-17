
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
import GroupWorkIcon from '@material-ui/icons/GroupWork';
import ListItem from "@material-ui/core/ListItem";
import ListItemIcon from "@material-ui/core/ListItemIcon";
import ListItemText from "@material-ui/core/ListItemText";
import InboxIcon from "@material-ui/icons/MoveToInbox";
import MailOutlineIcon from '@material-ui/icons/MailOutline';
import DraftsIcon from '@material-ui/icons/Drafts';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import ExpandLessIcon from '@material-ui/icons/ExpandLess';

import { useApolloClient } from '@apollo/client';

import { useStylesAndTheme } from "../../theme";
import { mapHashNames } from "../../constants";
import {  AuthInfoInterface } from "../../interfaces";
import { serverConfigQuery } from "../../queries/server";
import { MainContext, SearchContext, ActiveUrlContext, ConfigContext } from "../../contexts";
import { extractAuthInfo } from "../../utils/config"
import { CapturingSuspense } from "../misc";
const SideBarClusters = React.lazy(() => import("./clusters"));
const SideBarContents = React.lazy(() => import("./contents"));
const SideBarNotifications = React.lazy(() => import("./notifications"));


type SideBarProps = {
  openState: any,
};

type SideBarHeaderProps = {
  closeButton: any,
  headerExpanded: boolean,
  setHeaderExpanded: any
};


type SideBarControlProps = {
};

const SideBarHeader = (props: SideBarHeaderProps) => {
  const {classes, theme} = useStylesAndTheme();
  const { closeButton, headerExpanded, setHeaderExpanded } = props;
  const {activeUrl, setActiveUrl} = React.useContext(ActiveUrlContext);
  const { config, setConfig } = React.useContext(ConfigContext);
  const { searchCtx, setSearchCtx } = React.useContext(SearchContext);
  const client = useApolloClient();
  const headerElements = (
    <Autocomplete
      onFocus={() => setHeaderExpanded(true)}
      className={classes.sideBarHeaderSelect}
      freeSolo
      value={activeUrl}
      options={Object.keys(config ? config.hosts : {})}
      disableClearable
      onChange={async (event: any, value: any, reason: string) => {
        if(!value) return;
        switch (reason) {
          case "create-option":
            if(config && !config.hosts[value]){
              const hashAlgos = [];
              try{
                const result = await client.query({
                  query: serverConfigQuery
                });
                for(const algo of result.data.secretgraph.config.hashAlgorithms){
                  const mappedName = mapHashNames[algo].name;
                  if (mappedName){
                    hashAlgos.push(mappedName);
                  }
                }
              } catch(exc){
                console.warn("Cannot add host", exc);
                return
              }
              if (!hashAlgos){
                console.warn("Cannot add host, no fitting hash algos found");
                return
              }
              const newConfig = {
                ...config,
                hosts: {
                  ...config.hosts
                }
              };
              hashAlgos
              newConfig.hosts[value] = {hashAlgorithms: hashAlgos, clusters: {}};
              setConfig(newConfig)
            }
            setActiveUrl(value);
            break;
          case "select-option":
            // TODO: update hash list
            setActiveUrl(value);
            break;
          case "remove-option":
            if (config && config.hosts[value] && Object.keys(config.hosts[value]).length === 0){
              const newConfig = {
                ...config,
                clusters: {
                  ...config.hosts
                }
              };
              delete newConfig.hosts[value];
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
      </Collapse>
    </React.Fragment>
  )
}

const SideBar = (props: SideBarProps) => {
  const {classes, theme} = useStylesAndTheme();
  const { openState} = props;
  const {searchCtx, setSearchCtx} = React.useContext(SearchContext);
  const {activeUrl, setActiveUrl} = React.useContext(ActiveUrlContext);
  const { mainCtx, setMainCtx } = React.useContext(MainContext);
  const { config, setConfig } = React.useContext(ConfigContext);
  const [headerExpanded, setHeaderExpanded] = React.useState(false);
  const [openMenu, setOpenMenu] = React.useState("notifications");
  let authinfo : AuthInfoInterface | null = null;
  let activeElements = [];
  let sideBarItems = [];
  const closedSymbol = theme.direction === "ltr" ? (
    <ChevronRightIcon />
  ) : (
    <ChevronLeftIcon />
  )
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
  if (config){
    authinfo = extractAuthInfo(config, activeUrl);
    if (searchCtx.cluster) {
      activeElements.push((
        <ListItem
          button
          key="clusters:show:known"
          onClick={() => {
            if(openMenu === "clusters") {
              setOpenMenu("notifications");
            } else {
              setOpenMenu("clusters")
            }
            setMainCtx({
              ...mainCtx,
              item: null,
              type: "Cluster",
              action: "view",
              state: "default"
            });
            setSearchCtx({
              ...searchCtx,
              cluster: searchCtx.cluster
            });
            setHeaderExpanded(false);
          }}
        >
          {(openMenu === "clusters") ? (<ExpandMoreIcon/>) : closedSymbol}
          <ListItemText
            key={"clusters:show:known.text"}
            className={classes.sideBarEntry}
            primary={`${searchCtx.cluster}`} />
        </ListItem>
      ))
    } else {
      activeElements.push((
        <ListItem
          button
          key="clusters:show:unknown"
          onClick={() => {
            if(openMenu === "clusters") {
              setOpenMenu("notifications");
            } else {
              setOpenMenu("clusters")
            }
            setMainCtx({
              ...mainCtx,
              item: null,
              type: "Cluster",
              action: "view",
              state: "default"
            });
            setSearchCtx({
              ...searchCtx,
              cluster: null
            });
            setHeaderExpanded(false);
          }}
        >
          {closedSymbol}
          <ListItemText
            key="clusters:show:unknown.text"
            className={classes.sideBarEntry}
            primary={(openMenu === "clusters") ? "Show Notifications" : "Show Clusters"} />
        </ListItem>
      ))
    }
    if (mainCtx.item && mainCtx.type != "Cluster") {
      activeElements.push((
        <ListItem
          button
          className={classes.sideBarContentList}
          key="content:show"
          onClick={() => {
            if(openMenu === "contents") {
              setOpenMenu("notifications");
            } else {
              setOpenMenu("contents")
            }
          }}
        >
          {(openMenu === "contents") ? (<ExpandMoreIcon/>) : closedSymbol}
          <ListItemText
            key="content:show.text"
            className={classes.sideBarEntry}
            primary={`${mainCtx.type}: ${mainCtx.item}`} />
        </ListItem>
      ));
    }
    switch (openMenu){
      case "notifications":
        sideBarItems.push((
          <SideBarNotifications
            authinfo={authinfo}
            header={"Notifications"}
          />
        ));
        break;
      case "contents":
        if (mainCtx.state == "default"){
          sideBarItems.push((
            <SideBarContents
              activeCluster={searchCtx.cluster}
              activeContent={mainCtx.item}
              usePublic
              header="Public"
              loadMoreExtra={
                () => setMainCtx({
                  ...mainCtx,
                  state: "public"
                })
              }
              selectItem={
                (content: any) => {
                  let type = content.tags.find((flag: string) => flag.startsWith("type="));
                  if (type){
                    // split works different in js, so 2
                    type = type.split("=", 2)[1];
                  }
                  if (type == "PrivateKey" ) {
                    type = "PublicKey";
                  }
                  setMainCtx({
                    ...mainCtx,
                    action: "view",
                    type: type,
                    item: content.id,
                    url: activeUrl,
                    state: "public"
                  });
                  setHeaderExpanded(false);
                  setOpenMenu("notifications");
                }
              }
            />
          ))
          sideBarItems.push((
            <SideBarContents
              authinfo={authinfo}
              activeCluster={searchCtx.cluster}
              activeContent={mainCtx.item}
              header="Internal"
              state="internal"
              loadMoreExtra={
                () => setMainCtx({
                  ...mainCtx,
                  state: "internal"
                })
              }
              selectItem={
                (content: any) => {
                  let type = content.tags.find((flag: string) => flag.startsWith("type="));
                  if (type){
                    // split works different in js, so 2
                    type = type.split("=", 2)[1];
                  }
                  if (type == "PrivateKey" ) {
                    type = "PublicKey";
                  }
                  setMainCtx({
                    ...mainCtx,
                    action: "view",
                    type: type,
                    item: content.id,
                    url: activeUrl,
                    state: "internal"
                  });
                  setHeaderExpanded(false);
                  setOpenMenu("notifications");
                }
              }
            />
          ))
        } else {
          sideBarItems.push((
            <SideBarContents
              authinfo={authinfo}
              activeContent={mainCtx.item}
              activeCluster={searchCtx.cluster}
              state={mainCtx.state}
              selectItem={
                (content: any) => {
                  let type = content.tags.find((flag: string) => flag.startsWith("type="));
                  if (type){
                    // split works different in js, so 2
                    type = type.split("=", 2)[1];
                  }
                  if (type == "PrivateKey" ) {
                    type = "PublicKey";
                  }
                  setMainCtx({
                    ...mainCtx,
                    action: "view",
                    type: type,
                    item: content.id,
                    url: activeUrl
                  });
                  setHeaderExpanded(false);
                  setOpenMenu("notifications");
                }
              }
            />
          ))
        }
        break;
      case "clusters":
        sideBarItems.push((
          <SideBarClusters
            authinfo={authinfo}
            state={mainCtx.state}
            activeCluster={searchCtx.cluster}
            header="Clusters"
            selectItem={
              (cluster: any) => {
                setMainCtx({
                  ...mainCtx,
                  item: cluster.id,
                  type: "Cluster",
                  action: "view",
                  state: "default",
                  url: activeUrl
                });
                setSearchCtx({
                  ...searchCtx,
                  cluster: cluster.id
                });
                setHeaderExpanded(false);
                setOpenMenu("contents");
              }
            }
          />
        ))
        break
    }
  }
  return (
    <Drawer
      className={openState.drawerOpen && config ? classes.drawerOpen : classes.drawerClosed}
      variant="persistent"
      anchor={theme.direction === 'ltr' ? 'left' : 'right'}
      open={!!(openState.drawerOpen && config)}
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
      <List>
        {activeElements}
      </List>
      <Divider />
      <div className={classes.sideBarBody}>
        <CapturingSuspense>
          {sideBarItems}
        </CapturingSuspense>
      </div>
    </Drawer>
  );
  // }, [searchCtx.cluster, authinfo, activeUrl, headerExpanded, openState.drawerOpen]);
}

export default SideBar;
