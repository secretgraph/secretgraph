import * as React from "react";
import Divider from "@material-ui/core/Divider";
import GroupWorkIcon from '@material-ui/icons/GroupWork';
import { parse, graph } from 'rdflib';
import ListItem from "@material-ui/core/ListItem";
import ListItemIcon from "@material-ui/core/ListItemIcon";
import ListItemText from "@material-ui/core/ListItemText";
import { Theme } from "@material-ui/core/styles";
import { gql, useQuery } from '@apollo/client';
import { RDFS, CLUSTER } from "../../constants"
import { themeComponent } from "../../theme";
import { ConfigInterface, SearchContextInterface } from "../../interfaces";


type SideBarItemsProps = {
  classes: any,
  theme: Theme,
  authkeys: string[],
  activeUrl: string,
  setItem: any
}


const clusterFeedQuery = gql`
  query SideBarClusterFeedQuery(
    $authorization: [String!]
    $include: [String!]
    $exclude: [String!]
    $count: Int
    $cursor: String
  ) {
    clusters: clusters(
      authorization: $authorization,
      includeTags: $include,
      excludeTags: $exclude,
      first: $count,
      after: $cursor
    ) @connection(key: "SideBar_clusters", filters:["include", "exclude"]) {
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
  const { classes, theme, activeUrl, authkeys, setItem } = appProps;
  let hasNextPage = true;

  const { data, fetchMore, loading } = useQuery(
    clusterFeedQuery,
    {
      variables: {
        authorization: authkeys
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
        const store = graph();
        parse(edge.node.publicInfo, store, "");
        const results = store.querySync(`SELECT ?label, ?comment WHERE {_:cluster a ${CLUSTER("Cluster")}; ${RDFS("label")} ?label; ${RDFS("comment")} ?comment. }`)
        let label: string=edge.node.id as string, comment: string="";
        if(results.length > 0) {
          label = results[0][0];
          comment = results[0][0];
        }
        return (
          <ListItem button key={`${activeUrl}:${edge.node.id}`}
            onClick={() => setItem(edge.node)}
          >
            <ListItemIcon>
              <GroupWorkIcon />
            </ListItemIcon>
            <ListItemText primary={label ? label : `...${edge.node.id.substr(-48)}`} title={comment} />
          </ListItem>
        );
      })}

      <Divider />
      <ListItem button key={"loadmore"}
        disabled={(loading || !hasNextPage)}
        onClick={() => {
          _loadMore();
        }}
      >
        <ListItemText primary={"Load more..."} />
      </ListItem>
    </React.Fragment>
  );
})
