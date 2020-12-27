import * as React from "react";
import Divider from "@material-ui/core/Divider";
import DescriptionIcon from '@material-ui/icons/Description';
import MovieIcon from '@material-ui/icons/Movie';
import List from "@material-ui/core/List";
import ListItem from "@material-ui/core/ListItem";
import ListItemIcon from "@material-ui/core/ListItemIcon";
import ListItemText from "@material-ui/core/ListItemText";
import ListSubheader from '@material-ui/core/ListSubheader';
import DraftsIcon from '@material-ui/icons/Drafts';
import MailIcon from "@material-ui/icons/Mail";
import { gql, useQuery } from '@apollo/client';
import { useStylesAndTheme } from "../../theme";
import { elements } from "../../editors";
import { AuthInfoInterface } from "../../interfaces";
import { SearchContext, ActiveUrlContext } from "../../contexts";


type SideBarItemsProps = {
  authinfo?: AuthInfoInterface
  selectItem: any
  state?: string
  activeContent: string | null
  activeCluster: string | null
  header?: any
  loadMoreExtra?: any
  usePublic?: boolean
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
  contents: secretgraph(authorization: $authorization) {
    contents(
      clusters: $clusters
      includeTags: $include
      excludeTags: $exclude
      public: $public
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
}
`;


// ["type=", "state=", ...
export default function Contents(appProps: SideBarItemsProps) {
  const {classes, theme} = useStylesAndTheme();
  const { authinfo, selectItem, loadMoreExtra, activeCluster, activeContent, state, header, usePublic } = appProps;
  const {searchCtx} = React.useContext(SearchContext);
  const {activeUrl} = React.useContext(ActiveUrlContext);
  let hasNextPage = true;
  const _usePublic = (usePublic === undefined) ? null : usePublic;
  const incl = searchCtx.include.concat([]);
  if(state){
    incl.push(`state=${state}`)
  }
  if (authinfo){
    incl.push(...authinfo.hashes.map((value) => `hash=${value}`));
  }
  const { data, fetchMore, loading } = useQuery(
  contentFeedQuery,
  {
    variables: {
      authorization: authinfo ? authinfo.keys : null,
      include: incl,
      exclude: searchCtx.exclude,
      clusters: activeCluster ? [activeCluster] : null,
      public: _usePublic,
      count: 30,
      cursor: null
    }
  });
  if (loading) return null;
  hasNextPage = data.contents.contents.pageInfo.hasNextPage;
  const _loadMore = () => {
  fetchMore({
      variables: {
      cursor: data.contents.contents.pageInfo.endCursor
      },
  }).then((result: any) => {
      hasNextPage = result.data.contents.contents.pageInfo.hasNextPage
      if(loadMoreExtra){
        loadMoreExtra();
      }
  })
  }

  const render_item = (node: any) => {
    let type = node.tags.find((flag: string) => flag.startsWith("type="));
    let state = node.tags.find((flag: string) => flag.startsWith("state="));
    if (type){
        // split works different in js, so match
        type = type.match(/=(.*)/)[1];
    }
    if (state){
        // split works different in js, so match
        state = state.match(/=(.*)/)[1];
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
        <ListItem key={`${activeUrl}:${node.id}`}>
          <ListItemText
            key={`${activeUrl}:${node.id}.text`}
            className={classes.sideBarEntry} primary={`${elements.get(type) ? elements.get(type)?.label : type}: ...${node.id.substr(-48)}`} />
        </ListItem>
      )
    }
    return (
        <ListItem button key={`${activeUrl}:${node.id}`}
          onClick={() => selectItem(node)}
        >
          <ListItemIcon
            key={`${activeUrl}:${node.id}.icon`}
          >
              {icon}
          </ListItemIcon>
          {state== "draft" ? <ListItemIcon><DraftsIcon /></ListItemIcon> : null}
          <ListItemText
            key={`${activeUrl}:${node.id}.text`}
            className={classes.sideBarEntry} primary={`${elements.get(type) ? elements.get(type)?.label : type}: ...${node.id.substr(-48)}`} />
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
      {data.contents.contents.edges.map((edge: any) => render_item(edge.node))}
      <Divider />
      <ListItem button key={`${activeUrl}:${activeCluster ? activeCluster : "none"}:content:loadmore`}
      disabled={(loading || !hasNextPage)}
      onClick={() => {
          _loadMore();
      }}
      >
      <ListItemText
        key={`${activeUrl}:${activeCluster ? activeCluster : "none"}:content:loadmore.text`}
        primary={"Load more contents..."} />
      </ListItem>
    </List>
  );
}
