
import { Environment, Network, RecordSource, Store } from "relay-runtime";


export const createEnvironment = (url: string) => {
  async function fetchQuery(operation: any, variables: any) {
    const response = await fetch(url as string, {
      method: "POST",
      mode: "cors",
      credentials: 'include',
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
  return new Environment({
    network: Network.create(fetchQuery),
    store: new Store(new RecordSource()),
  });
}
