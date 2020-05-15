import * as React from "react";
import * as ReactDOM from "react-dom";
import {graphql, QueryRenderer} from 'react-relay';
import { Environment, Network, RecordSource, Store } from "relay-runtime";

let wrapper = document.getElementById("content-main");


async function fetchQuery(operation: any, variables: any) {
  if (!wrapper){
    throw new Error("element not found");
  }
  const response = await fetch(wrapper.dataset.serverPath as string, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: operation.text,
      variables,
    }),
  });
  return response.json();
}

const environment = new Environment({
  network: Network.create(fetchQuery),
  store: new Store(new RecordSource()),
});

class App extends React.Component {
  render() {
    return (
      <QueryRenderer
        environment={environment}
        query={graphql`
          query jsAppQuery {
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
          return <div>User ID: { props.requireServersideEncryption}</div>;
        }}
      />
    );
  }
}

ReactDOM.render(<App />, wrapper);
