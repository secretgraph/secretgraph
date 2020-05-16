import * as React from "react";
import { graphql, QueryRenderer } from "react-relay";
import { environment } from "../environment";
import HeaderBar from "../components/HeaderBar";
import SideBar from "../components/SideBar";


type Props = {
};

export default class MainPage extends React.Component<Props> {
  drawerRef: React.RefObject<any>

  constructor(props: any) {
    super(props);
    this.drawerRef = React.createRef();
  }
  render() {
    // const {userID} = this.props;
    const openDrawer = () => {
      this.drawerRef.current?.openDrawer();
    };
    return (
      <div>
        <HeaderBar drawerOpener={openDrawer.bind(this)} />
        <SideBar sidebarHandler="" ref={this.drawerRef} />
        <main>
          <div></div>
        </main>
      </div>
    );
  }
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
