import * as React from "react";
import Divider from "@material-ui/core/Divider";
import DescriptionIcon from '@material-ui/icons/Description';
import MovieIcon from '@material-ui/icons/Movie';
import List from "@material-ui/core/List";
import ListItem from "@material-ui/core/ListItem";
import ListItemIcon from "@material-ui/core/ListItemIcon";
import ListItemText from "@material-ui/core/ListItemText";
import DraftsIcon from '@material-ui/icons/Drafts';
import MailIcon from "@material-ui/icons/Mail";
import ListSubheader from '@material-ui/core/ListSubheader';
import { gql, useQuery } from '@apollo/client';
import { useStylesAndTheme } from "../../theme";
import { elements } from "../elements";
import { AuthInfoInterface } from "../../interfaces";
import { SearchContext, ActiveUrlContext } from "../../contexts";


type SideBarItemsProps = {
  authinfo?: AuthInfoInterface,
  selectItem: any,
  state: string,
  activeContent: string | null,
  activeCluster: string | null
  header?: any
}


const contentFeedQuery =  gql`
query SideBarContentFeedQuery(
  $clusters: [ID!]
  $authorization: [String!]
  $include: [String!]
  $exclude: [String!]
  $public: Boolean
  $includeTags: [String!]
  $count: Int
  $cursor: String
) {
  contents: contents(
    clusters: $clusters
    includeTags: $include
    excludeTags: $exclude
    public: $public
    authorization: $authorization
    first: $count
    after: $cursor
  )  @connection(key: "SideBar_contents", filters:["include", "exclude", "clusters", "public"])  {
    edges {
      node {
        id
        nonce
        link
        tags(includeTags: $includeTags)
        references(groups: ["key", "signature"], includeTags: $include) {
          edges {
            node {
              extra
              target {
                tags(includeTags: ["key_hash="])
              }
            }
          }
        }
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
`;


// ["type=", "state=", ...
export default (appProps: SideBarItemsProps) => {
  const {classes, theme} = useStylesAndTheme();
  const { authinfo, selectItem, activeCluster, activeContent, state, header } = appProps;
  const {searchCtx} = React.useContext(SearchContext);
  const {activeUrl} = React.useContext(ActiveUrlContext);
  let hasNextPage = true;
  let usePublic = null;
  const incl = searchCtx.include.concat([]);
  if (authinfo && authinfo.hashes instanceof Array){
    usePublic = false;
    if("default" !== state){
      incl.push(`state=${state}`);
    }
    incl.push(...authinfo.hashes.map((value) => `hash=${value}`));
  } else if ("default" === state){
    usePublic = true;
  }

  const { data, fetchMore, loading } = useQuery(
  contentFeedQuery,
  {
    variables: {
      authorization: authinfo ? authinfo.keys : null,
      include: incl,
      exclude: searchCtx.exclude,
      clusters: activeCluster ? [activeCluster] : null,
      public: usePublic,
      count: 30,
      cursor: null
    }
  });
  if (loading) return null;
  hasNextPage = data.contents.pageInfo.hasNextPage;
  const _loadMore = () => {
  fetchMore({
      variables: {
      cursor: data.contents.pageInfo.endCursor
      },
  }).then((result: any) => {
      hasNextPage = result.data.contents.pageInfo.hasNextPage
  })
  }

  const render_item = (node: any) => {
    let type = node.tags.find((flag: string) => flag.startsWith("type="));
    let state = node.tags.find((flag: string) => flag.startsWith("state="));
    if (type){
        // split works different in js, so 2
        type = type.split("=", 2)[1];
    }
    if (state){
        // split works different in js, so 2
        state = state.split("=", 2)[1];
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
    if (activeContent && activeContent == node.id){
      return (
        <ListItem key={`${activeUrl}:${node.id}:active`}>
          <ListItemText className={classes.sideBarEntry} primary={`${elements.get(type) ? elements.get(type)?.label : type}: ...${node.id.substr(-48)}`} />
        </ListItem>
      )
    }
    return (
        <ListItem button key={`${activeUrl}:${node.id}`}
          onClick={() => selectItem(node)}
        >
          <ListItemIcon>
              {icon}
          </ListItemIcon>
          {state== "draft" ? <ListItemIcon><DraftsIcon /></ListItemIcon> : null}
          <ListItemText className={classes.sideBarEntry} primary={`${elements.get(type) ? elements.get(type)?.label : type}: ...${node.id.substr(-48)}`} />
        </ListItem>
    );
  }
  let _header = null;
  if (header){
    _header = (
      <ListSubheader
        key="header"
        className={classes.sideBarEntry}
      >
        {header}
      </ListSubheader>
    )
  }

  return (
    <List>
      {_header}
      {data.contents.edges.map((edge: any) => render_item(edge.node))}
      <Divider />
      <ListItem button key={`${activeUrl}:${activeCluster ? activeCluster : "none"}:content:loadmore`}
      disabled={(loading || !hasNextPage)}
      onClick={() => {
          _loadMore();
      }}
      >
      <ListItemText primary={"Load more contents..."} />
      </ListItem>
    </List>
  );
}
