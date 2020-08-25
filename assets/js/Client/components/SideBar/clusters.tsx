import * as React from "react";
import Divider from "@material-ui/core/Divider";
import GroupWorkIcon from '@material-ui/icons/GroupWork';
import { parse, graph } from 'rdflib';
import List from "@material-ui/core/List";
import ListItem from "@material-ui/core/ListItem";
import ListItemIcon from "@material-ui/core/ListItemIcon";
import ListItemText from "@material-ui/core/ListItemText";
import ListSubheader from '@material-ui/core/ListSubheader';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import ExpandLessIcon from '@material-ui/icons/ExpandLess';
import { Theme } from "@material-ui/core/styles";
import { gql, useQuery } from '@apollo/client';
import { RDFS, CLUSTER } from "../../constants"
import { themeComponent } from "../../theme";
import { CapturingSuspense } from "../misc";
import { ActiveUrlContext } from "../../contexts";
import { AuthInfoInterface } from "../../interfaces";

const SideBarContents = React.lazy(() => import("./contents"));


type SideBarItemsProps = {
  classes: any,
  theme: Theme,
  authinfo: AuthInfoInterface,
  activeCluster?: string,
  setItemComponent: any,
  setItemContent: any
}


const clusterFeedQuery = gql`
  query SideBarClusterFeedQuery(
    $authorization: [String!]
    $include: [String!]
    $exclude: [String!]
    $public: Boolean
    $count: Int
    $cursor: String
  ) {
    clusters: clusters(
      authorization: $authorization,
      includeTags: $include,
      excludeTags: $exclude,
      public: $public,
      first: $count,
      after: $cursor
    ) @connection(key: "SideBar_clusters", filters:["include", "exclude", "public"]) {
      edges {
        node {
          id
          publicInfo
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`

export default themeComponent((appProps: SideBarItemsProps) => {
  const { classes, theme, authinfo, setItemComponent, setItemContent, activeCluster } = appProps;
  let hasNextPage = true;
  const {activeUrl} = React.useContext(ActiveUrlContext);

  const { data, fetchMore, loading } = useQuery(
    clusterFeedQuery,
    {
      variables: {
        authorization: authinfo.keys
      }
    }
  );
  if (loading) return null;
  hasNextPage = data.clusters.pageInfo.hasNextPage;


  const _loadMore = () => {
    fetchMore({
      variables: {
        cursor: data.clusters.pageInfo.endCursor
      }
    }).then((result: any) => {
      hasNextPage = result.data.clusters.pageInfo.hasNextPage
    })
  }

  return (
    <React.Fragment>
      {data.clusters.edges.map((edge: any) => {
        let label: string | undefined, comment: string="";
        if (edge.node.publicInfo){
          try {
            const store = graph();
            parse(edge.node.publicInfo, store, "");
            const results = store.querySync(`SELECT ?label, ?comment WHERE {_:cluster a ${CLUSTER("Cluster")}; ${RDFS("label")} ?label; ${RDFS("comment")} ?comment. }`)
            if(results.length > 0) {
              label = results[0][0];
              comment = results[0][1];
            }
          } catch(exc){
            console.warn("Could not parse publicInfo", exc)
          }
        }
        if (edge.node.id === activeCluster) {
          return (
            <React.Fragment>
              <ListSubheader key={`${activeUrl}:cluster:header:${edge.node.id}`} className={classes.sideBarEntry} title={comment}>{label ? label : `...${edge.node.id.substr(-48)}`}</ListSubheader>
              <CapturingSuspense>
                <List dense component="div" className={classes.sideBarContentList} disablePadding>
                  <ListItem>
                    <ListItemText className={classes.sideBarEntry} primary="public" />
                  </ListItem>
                  <SideBarContents
                    setItem={setItemContent}
                    cluster={activeCluster}
                  />
                  <ListItem>
                    <ListItemText className={classes.sideBarEntry} primary="internal" />
                  </ListItem>
                  <Divider/>
                  <SideBarContents
                    setItem={setItemContent}
                    cluster={activeCluster}
                    authinfo={authinfo}
                  />
                </List>
              </CapturingSuspense>
            </React.Fragment>
          );
        } else {
          return (
            <ListItem button key={`${activeUrl}:cluster:entry:${edge.node.id}`}
              onClick={() => setItemComponent(edge.node)}
            >
              <ListItemIcon>
                <GroupWorkIcon />
              </ListItemIcon>
              <ListItemText className={classes.sideBarEntry} primary={label ? label : `...${edge.node.id.substr(-48)}`} title={comment} />
              {(edge.node.id !== activeCluster) ? <ExpandMoreIcon/> : null}
            </ListItem>
          );

        }
      })}

      <Divider />
      <ListItem button key={`${activeUrl}:cluster:loadmore`}
        disabled={(loading || !hasNextPage)}
        onClick={() => {
          _loadMore();
        }}
      >
        <ListItemText primary={"Load more clusters..."} />
      </ListItem>
    </React.Fragment>
  );
})
