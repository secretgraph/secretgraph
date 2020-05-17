import * as React from "react";
import { graphql, QueryRenderer } from "react-relay";
import { environment } from "../environment";
import HeaderBar from "../components/HeaderBar";
import SideBar from "../components/SideBar";


type Props = {
};

export default function MainPage() {
  // const {userID} = this.props;
  const [drawerOpen, setDrawerOpen] = React.useState(true);
  return (
    <div>
      <HeaderBar open={drawerOpen} setDrawerOpen={setDrawerOpen} />
      <SideBar
        sidebarHandler=""
        open={drawerOpen}
        setDrawerOpen={setDrawerOpen}
      />
      <main>
        <div></div>
      </main>
    </div>
  );
}
/**

export class App extends React.Component {
  render() {
    return (
      <QueryRenderer
        environment={environment}
        query={graphql`
          query MainAppQuery {
            secretgraphConfig {
              requireServersideEncryption
            }
          }
        `}
        variables={{}}
        render={({ error, props }) => {
          if (error) {
            return <div>Error!</div>;
          }
          if (!props) {
            return <div>Loading...</div>;
          }
          return (
            <div>
              User ID: {props.requireServersideEncryption ? "true" : "false"}
            </div>
          );
        }}
      />
    );
  }
}
 */
