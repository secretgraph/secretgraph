import * as React from "react";
import { graphql, QueryRenderer } from "react-relay";
import { environment } from "../environment";
import HeaderBar from "../components/HeaderBar";



export default function MainPage() {
  return (
    <div>
      <HeaderBar />
      <main></main>
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
