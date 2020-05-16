
import { Environment, Network, RecordSource, Store } from "relay-runtime";


let serverPath: string = "/graphql";

export function updateServerPath(newPath: string | null | undefined){
    if (newPath){
        serverPath = newPath;
    }
}

async function fetchQuery(operation: any, variables: any) {
  const response = await fetch(serverPath as string, {
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
export const environment = new Environment({
  network: Network.create(fetchQuery),
  store: new Store(new RecordSource()),
});
