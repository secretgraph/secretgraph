
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
import StarIcon from '@material-ui/icons/Star';
import { parse, graph } from 'rdflib';
import ListItem from "@material-ui/core/ListItem";
import ListItemIcon from "@material-ui/core/ListItemIcon";
import ListItemText from "@material-ui/core/ListItemText";
import InboxIcon from "@material-ui/icons/MoveToInbox";
import MailOutlineIcon from '@material-ui/icons/MailOutline';
import DraftsIcon from '@material-ui/icons/Drafts';
import MailIcon from "@material-ui/icons/Mail";
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import { Theme } from "@material-ui/core/styles";
import {createPaginationContainer, graphql, RelayPaginationProp} from 'react-relay';
// import { usePagination, graphql } from 'relay-hooks';
import { RDFS, CLUSTER } from "../constants"
import { themeComponent } from "../theme";
import { ConfigInterface, ConfigClusterInterface, MainContextInterface } from "../interfaces";
import { elements } from "./elements";

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


type SideBarControlProps = {
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
  mainContext: MainContextInterface,
  setMainContext: any
}

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
  const { classes, theme, config, setMainContext, mainContext } = props;
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
          <ListItem button key={"Inbox"} onClick={() => setMainContext({
            ...mainContext,
            action: "view",
            item: "content",
            filter: ["type=Message"],
            exclude: []
          })}>
            <ListItemIcon>
              <InboxIcon />
            </ListItemIcon>
            <ListItemText primary={"Inbox"} />
          </ListItem>
          <ListItem button key={"Send"} onClick={() => setMainContext({
            ...mainContext,
            item: "Message",
            action: "edit",
          })}>
            <ListItemIcon>
              <MailOutlineIcon />
            </ListItemIcon>
            <ListItemText primary={"Send"} />
          </ListItem>
          <ListItem button key={"Drafts"} onClick={() => setMainContext({
            ...mainContext,
            action: "edit",
            item: "content",
            filter: ["state=draft"],
            exclude: []
          })}>
            <ListItemIcon>
              <DraftsIcon />
            </ListItemIcon>
            <ListItemText primary={"Drafts"} />
          </ListItem>
          <ListItem button key={"Cluster"} onClick={() => setMainContext({
            ...mainContext,
            action: ["view", "edit"].includes(mainContext.action) ? mainContext.action : "view",
            item: "cluster",
            filter: [],
            exclude: []
          })}>
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

class ContentFeed extends React.Component<{classes: any, theme: any, config: ConfigInterface, mainContext: any, setMainContext:any,
  contents: any, relay: RelayPaginationProp}> {
  render_item(node: any) {
    let type = node.info.find((info: string) => info.startsWith("type="))
    let state = node.info.find((info: string) => info.startsWith("state="))
    if (type){
      type = type.split("=", 1)[1];
    }
    if (state){
      state = state.split("=", 1)[1];
    }
    let icon;
    switch(type){
      case "Message":
        icon = (<MailIcon />);
        break;
      case "File":
        icon = (<MovieIcon />);
        break;
      default:
        icon = (<DescriptionIcon />);
    }
    return (
      <ListItem button key={`${this.props.mainContext.activeUrl}:${node.id}`}
        onClick={() => {
          this.props.setMainContext({
            ...this.props.mainContext,
            item: node.id,
            action: "view"
          })
        }}
      >
        <ListItemIcon>
          {icon}
        </ListItemIcon>
        {state== "draft" ? <ListItemIcon><DraftsIcon /></ListItemIcon> : null}
        <ListItemText primary={`${elements.get(type)?.label || type}: ${node.id}`} />
      </ListItem>
    );
  }
  render() {
    return (
      <List>
        {this.props.contents.edges.map((edge: any) => this.render_item(edge.node))}
        <Divider />
        <ListItem button key={"loadmore"}
          disabled={(!this.props.relay.hasMore() || this.props.relay.isLoading())}
          onClick={() => {
            this._loadMore();
          }}
        >
          <ListItemText primary={"Load more..."} />
        </ListItem>
      </List>
    );
  }

  _loadMore() {
    if (!this.props.relay.hasMore() || this.props.relay.isLoading()) {
      return;
    }

    this.props.relay.loadMore(
      30,
      (error: any) => {
        console.log(error);
      },
    );
  }
}

const PaginatedContentFeed = createPaginationContainer(
  ContentFeed,
  {
    contents: graphql`
      fragment SideBar_contents on SecretgraphQuery
      @argumentDefinitions(
        authorization: {type: "[String!]"}
        clusters: {type: "[ID!]"}
        include: {type: "[String!]"}
        exclude: {type: "[String!]"}
        includeInfo: {type: "[String!]"}
        count: {type: "Int!"}
        cursor: {type: "String!"}
      ) {
        contents: contents(
          clusters: $clusters
          includeInfo: $include
          excludeInfo: $exclude
          authorization: $authorization
          first: $count
          after: $cursor
        )  @connection(key: "SideBar_contents", filters:["include", "exclude", "clusters"])  {
          edges {
            node {
              id
              nonce
              link
              info(includeInfo: $includeInfo)
              references(groups: ["key", "signature"], includeInfo: $include) {
                edges {
                  node {
                    extra
                    target {
                      info(includeInfo: ["key_hash="])
                    }
                  }
                }
              }
            }
          }
        }
      }
    `,
  },
  {
    direction: 'forward',
    getConnectionFromProps(props) {
      return props.contents && props.contents.edges;
    },
    getVariables(props, {count, cursor}, fragmentVariables) {
      return {
        ...props,
        count,
        cursor,
      };
    },
    query:  graphql`
      query SideBarContentFeedQuery(
        $clusters: [ID!]
        $authorization: [String!]
        $include: [String!]
        $exclude: [String!]
        $includeInfo: [String!]
        $count: Int
        $cursor: String
      ) {
        ...SideBar_contents @arguments(
          authorization: $authorization
          clusters: $clusters
          include: $include
          exclude: $exclude
          includeInfo: $includeInfo
          count: $count
          cursor: $cursor
        )
      }
  `
  }
);

// ["type=", "state=", ...
const SideBarContents = themeComponent((props: SideBarItemsProps) => {
  const { classes, theme, config, mainContext, setMainContext } = props;
  return (
    <PaginatedContentFeed
      classes={classes}
      theme={theme}
      config={config}
      mainContext={mainContext}
      setMainContext={setMainContext}
      contents={{
        include: mainContext.include,
        authorization: []
      }}
    />
  )
})



class ClusterFeed extends React.Component<{
  classes: any, theme: any, config: ConfigInterface, mainContext: any, setMainContext:any,
  clusters: any, relay: RelayPaginationProp}> {
  render() {
    return (
      <List>
        {this.props.clusters.edges.map((edge: any) => {
          const store = graph();
          parse(edge.node.publicInfo, store, "");
          const results = store.querySync(`SELECT ?label, ?comment WHERE {_:cluster a ${CLUSTER("Cluster")}; ${RDFS("label")} ?label; ${RDFS("comment")} ?comment. }`)
          let label: string=edge.node.id as string, comment: string="";
          if(results.length > 0) {
            label = results[0][0];
            comment = results[0][0];
          }
          return (
            <ListItem button key={`${this.props.mainContext.activeUrl}:${edge.node.id}`}
              onClick={() => {
                this.props.setMainContext({
                  ...this.props.mainContext,
                  cluster: edge.node.id,
                  item: edge.snode.id,
                  action: "view"
                })
              }}
            >
              <ListItemIcon>
                <GroupWorkIcon />
              </ListItemIcon>
              <ListItemText primary={label} title={comment} />
            </ListItem>
          );
        })}

        <Divider />
        <ListItem button key={"loadmore"}
          disabled={(!this.props.relay.hasMore() || this.props.relay.isLoading())}
          onClick={() => {
            this._loadMore();
          }}
        >
          <ListItemText primary={"Load more..."} />
        </ListItem>
      </List>
    );
  }

  _loadMore() {
    if (!this.props.relay.hasMore() || this.props.relay.isLoading()) {
      return;
    }

    this.props.relay.loadMore(
      30,
      (error: any) => {
        console.log(error);
      },
    );
  }
}


export const clusterFeedQuery = graphql`
  query SideBarClusterFeedQuery(
    $authorization: [String!]
    $include: [String!]
    $exclude: [String!]
    $count: Int
    $cursor: String
  ) {
    ...SideBar_clusters @arguments(
      authorization: $authorization,
      include: $include,
      exclude: $exclude,
      count: $count,
      cursor: $cursor
    )
  }
`
const PaginatedClusterFeed = createPaginationContainer(
  ClusterFeed,
  {
    clusters: graphql`
      fragment SideBar_clusters on SecretgraphQuery
      @argumentDefinitions(
        authorization: {type: "[String!]"}
        include: {type: "[String!]"}
        exclude: {type: "[String!]"}
        count: {type: "Int!"}
        cursor: {type: "String!"}
      ) {
        clusters: clusters(
          authorization: $authorization,
          includeInfo: $include,
          excludeInfo: $exclude,
          first: $count,
          after: $cursor
        ) @connection(key: "SideBar_clusters", filters:["include", "exclude"]) {
          edges {
            node {
              id
              publicInfo
            }
          }
        }
      }
    `,
  },
  {
    direction: 'forward',
    getConnectionFromProps(props) {
      return props.clusters && props.clusters.edges;
    },
    getVariables(props, {count, cursor}, fragmentVariables) {
      return {
        ...props,
        count, cursor
      };
    },
    query: clusterFeedQuery
  }
);


const SideBarClusters = themeComponent((props: SideBarItemsProps) => {
  const { classes, theme, config, mainContext, setMainContext } = props;
  return (
    <PaginatedClusterFeed
      classes={classes}
      theme={theme}
      config={config}
      mainContext={mainContext}
      setMainContext={setMainContext}
      clusters={{
        include: mainContext.include,
        authorization: []
      }}
    />
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
    let sideBarItems = null;
    if (config){
      if(mainContext.item == "cluster"){
        sideBarItems = (
          <SideBarClusters>
            setMainContext={setMainContext}
            mainContext={mainContext}
            config={config}
          </SideBarClusters>
        );
      } else {
        sideBarItems = (
          <SideBarContents>
            setMainContext={setMainContext}
            mainContext={mainContext}
            config={config}
          </SideBarContents>
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
          <SideBarControl
            mainContext={mainContext}
            setMainContext={setMainContext}
            config={config}
          />
          {sideBarItems}
        </div>
      </Drawer>

    );
}

export default themeComponent(SideBar);
