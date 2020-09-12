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
import { RDFS, CLUSTER, SECRETGRAPH, contentStates } from "../../constants"
import { useStylesAndTheme } from "../../theme";
import { CapturingSuspense } from "../misc";
import { ActiveUrlContext } from "../../contexts";
import { AuthInfoInterface } from "../../interfaces";

const SideBarContents = React.lazy(() => import("./contents"));


type SideBarItemsProps = {
  authinfo: AuthInfoInterface,
  state: string,
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

export default (appProps: SideBarItemsProps) => {
  const {classes, theme} = useStylesAndTheme();
  const { state, authinfo, setItemComponent, setItemContent, activeCluster } = appProps;
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
        let name: string | undefined, note: string="";
        if (edge.node.publicInfo){
          try {
            const store = graph();
            parse(edge.node.publicInfo, store, "");
            const results = store.querySync(`SELECT ?name, ?note WHERE {_:cluster a ${CLUSTER("Cluster")}; ${SECRETGRAPH("name")} ?name. OPTIONAL { _:cluster ${SECRETGRAPH("note")} ?note } }`)
            if(results.length > 0) {
              name = results[0][0];
              note = results[0][1] ? results[0][1] : "";
            }
          } catch(exc){
            console.warn("Could not parse publicInfo", exc)
          }
        }
        if (edge.node.id === activeCluster) {
          let preambleStuff;
          if (state == "default"){
            preambleStuff = (
              <React.Fragment>
                <ListItem key="preamblepublic">
                  <ListItemText className={classes.sideBarEntry} primary={contentStates.get("public")?.label} />
                </ListItem>
                <SideBarContents
                  setItem={setItemContent}
                  cluster={activeCluster}
                />
                <ListItem key="preambleinternal">
                  <ListItemText className={classes.sideBarEntry} primary={contentStates.get("internal")?.label} />
                </ListItem>
              </React.Fragment>
            )
          } else {
            preambleStuff = (
              <React.Fragment>
                <ListItem key="preamblestate">
                  <ListItemText className={classes.sideBarEntry} primary={contentStates.get(state)?.label} />
                </ListItem>
                <Divider/>
              </React.Fragment>
            )
          }
          return (
            <React.Fragment>
              <ListSubheader
                key={`${activeUrl}:cluster:header:${edge.node.id}`}
                className={classes.sideBarEntry}
                title={note}
                onClick={() => setItemComponent(edge.node)}
              >
                {name ? name : `...${edge.node.id.substr(-48)}`}
              </ListSubheader>
              <CapturingSuspense>
                <List dense component="div" className={classes.sideBarContentList} disablePadding>
                  {preambleStuff}
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
              <ListItemText className={classes.sideBarEntry} primary={name ? name : `...${edge.node.id.substr(-48)}`} title={note} />
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
}
