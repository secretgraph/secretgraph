
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
  const {activeUrl, updateActiveUrl} = React.useContext(ActiveUrlContext);
  const { config, updateConfig } = React.useContext(ConfigContext);
  const { searchCtx, updateSearchCtx } = React.useContext(SearchContext);
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
                  const mappedName = mapHashNames[algo].operationName;
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
              newConfig.hosts[value] = {
                hashAlgorithms: hashAlgos, clusters: {}, contents: {}
              };
              updateConfig(newConfig)
            }
            updateActiveUrl(value);
            break;
          case "select-option":
            // TODO: update hash list
            updateActiveUrl(value);
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
              updateConfig(newConfig)
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
                updateSearchCtx({include:value});
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
                updateSearchCtx({exclude: value});
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

const ActiveElements = ({
  setOpenMenu,
  updateMainCtx,
  setHeaderExpanded,
  ...props
}: {
  cluster: string | null,
  openMenu: string,
  activeUrl: string,
  setOpenMenu: any,
  updateMainCtx: (props: any) => void,
  setHeaderExpanded: any,
  item: string | null,
  type: string | null
}) => {
  const {classes, theme} = useStylesAndTheme();

  const closedSymbol = theme.direction === "ltr" ? (
    <ChevronRightIcon key="closedicoltr"/>
  ) : (
    <ChevronLeftIcon key="closedicortl"/>
  )
  const activeElements = [];
  if (props.cluster) {
    activeElements.push((
      <ListItem
        button
        key="clusters:show:known"
        onClick={() => {
          if(props.openMenu === "clusters") {
            setOpenMenu("notifications");
          } else {
            setOpenMenu("clusters")
          }
          updateMainCtx({
            item: props.cluster,
            url: props.activeUrl,
            type: "Cluster",
            action: "view",
            state: "default"
          });
          setHeaderExpanded(false);
        }}
      >
        {(props.openMenu === "clusters") ? (<ExpandMoreIcon/>) : closedSymbol}
        <ListItemText
          key={"clusters:show:known.text"}
          className={classes.sideBarEntry}
          primary={`Cluster: ${props.cluster}`} />
      </ListItem>
    ))
  } else {
    activeElements.push((
      <ListItem
        button
        key="clusters:show:unknown"
        onClick={() => {
          if(props.openMenu === "clusters") {
            setOpenMenu("notifications");
          } else {
            setOpenMenu("clusters")
          }
          updateMainCtx({
            item: null,
            type: "Cluster",
            action: "view",
            state: "default"
          });
          setHeaderExpanded(false);
        }}
      >
        {closedSymbol}
        <ListItemText
          key="clusters:show:unknown.text"
          className={classes.sideBarEntry}
          primary={(props.openMenu === "clusters") ? "Show Notifications" : "Show Clusters"} />
      </ListItem>
    ))
  }
  if (props.item && props.type != "Cluster") {
    activeElements.push((
      <ListItem
        button
        className={classes.sideBarContentList}
        key="content:show"
        onClick={() => {
          if(props.openMenu === "contents") {
            setOpenMenu("notifications");
          } else {
            setOpenMenu("contents")
          }
        }}
      >
        {(props.openMenu === "contents") ? (<ExpandMoreIcon/>) : closedSymbol}
        <ListItemText
          key="content:show.text"
          className={classes.sideBarEntry}
          primary={`Content: ${props.type}: ${props.item}`} />
      </ListItem>
    ));
  }
  return (
    <List>
      {...activeElements}
    </List>
  )
}

const SideBarItems = ({
  updateMainCtx,
  updateSearchCtx,
  setHeaderExpanded,
  setOpenMenu,
  ...props
} : {
  openMenu: string,
  authinfo: AuthInfoInterface,
  state: string,
  cluster: string | null,
  item: string | null,
  updateMainCtx: any,
  updateSearchCtx: any,
  activeUrl: string,
  setHeaderExpanded: any,
  setOpenMenu: any
}) => {
  const {classes, theme} = useStylesAndTheme();
  const sideBarItems = [];
  switch (props.openMenu){
    case "notifications":
      sideBarItems.push((
        <SideBarNotifications
          key="SideBarNotifications"
          authinfo={props.authinfo}
          header={"Notifications"}
        />
      ));
      break;
    case "contents":
      if (props.state == "default"){
        sideBarItems.push((
          <SideBarContents
            key="SideBarContentsPublic"
            activeCluster={props.cluster}
            activeContent={props.item}
            usePublic
            header="Public"
            loadMoreExtra={
              () => updateMainCtx({
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
                const url = new URL(props.activeUrl);
                updateMainCtx({
                  action: "view",
                  type: type,
                  item: content.id,
                  url: props.activeUrl,
                  shareUrl: `${url.origin}${content.link}`,
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
            key="SideBarContentsInternal"
            authinfo={props.authinfo}
            activeCluster={props.cluster}
            activeContent={props.item}
            header="Internal"
            state="internal"
            loadMoreExtra={
              () => updateMainCtx({
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
                const url = new URL(props.activeUrl);
                updateMainCtx({
                  action: "view",
                  type: type,
                  item: content.id,
                  url: props.activeUrl,
                  shareUrl: `${url.origin}${content.link}`,
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
            key="SideBarContents"
            authinfo={props.authinfo}
            activeContent={props.item}
            activeCluster={props.cluster}
            state={props.state}
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
                const url = new URL(props.activeUrl);
                updateMainCtx({
                  action: "view",
                  type: type,
                  item: content.id,
                  url: props.activeUrl,
                  shareUrl: `${url.origin}${content.link}`,
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
          key="SideBarClusters"
          authinfo={props.authinfo}
          activeCluster={props.cluster}
          header="Clusters"
          selectItem={
            (cluster: any) => {
              const url = new URL(props.activeUrl);
              updateMainCtx({
                item: cluster.id,
                type: "Cluster",
                action: "view",
                state: "default",
                url: props.activeUrl,
                shareUrl: `${url.origin}${cluster.link}`
              });
              updateSearchCtx({
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
  return (
    <div className={classes.sideBarBody}>
      <CapturingSuspense>
        {...sideBarItems}
      </CapturingSuspense>
    </div>
  )
}

const SideBar = (props: SideBarProps) => {
  const {classes, theme} = useStylesAndTheme();
  const { openState} = props;
  const {searchCtx, updateSearchCtx} = React.useContext(SearchContext);
  const {activeUrl, updateActiveUrl} = React.useContext(ActiveUrlContext);
  const { mainCtx, updateMainCtx } = React.useContext(MainContext);
  const { config, updateConfig } = React.useContext(ConfigContext);
  const [headerExpanded, setHeaderExpanded] = React.useState(false);
  const [openMenu, setOpenMenu] = React.useState("notifications");
  let activeElements : any = null;
  let sideBarItems : any = null;
  const closeButton = (
    <Hidden lgUp>
      <IconButton onClick={() => openState.setDrawerOpen(false)}>
        {theme.direction === "ltr" ? (
          <ChevronLeftIcon key="closeicoltr"/>
        ) : (
          <ChevronRightIcon key="closeicortl"/>
        )}
      </IconButton>
    </Hidden>
  );
  if (config){
    const authinfo = extractAuthInfo(config, activeUrl);
    activeElements = (
      <ActiveElements
        openMenu={openMenu}
        item={mainCtx.item}
        cluster={searchCtx.cluster}
        type={mainCtx.type}
        activeUrl={activeUrl}
        updateMainCtx={updateMainCtx}
        setHeaderExpanded={setHeaderExpanded}
        setOpenMenu={setOpenMenu}
      />
    )

    sideBarItems = (
      <SideBarItems
        openMenu={openMenu}
        authinfo={authinfo}
        state={mainCtx.state}
        cluster={searchCtx.cluster}
        item={mainCtx.item}
        activeUrl={activeUrl}
        updateMainCtx={updateMainCtx}
        updateSearchCtx={updateSearchCtx}
        setHeaderExpanded={setHeaderExpanded}
        setOpenMenu={setOpenMenu}
      />
    )
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
      <Divider/>
      {activeElements}
      <Divider />
      {sideBarItems}
    </Drawer>
  );
}

export default SideBar;
