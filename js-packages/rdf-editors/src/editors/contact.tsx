import { useApolloClient, useQuery } from '@apollo/client'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import { useTheme } from '@mui/material/styles'
import * as Contexts from '@secretgraph/client/Client/contexts'
import * as React from 'react'

type Props = {}

const ViewFile = (props: Props) => {
    const theme = useTheme()
    const { mainCtx } = React.useContext(Contexts.Main)
    const client = useApolloClient()
    const { config } = React.useContext(Contexts.Config)
    /**const { data, error } = useAsync({
        suspense: true,
        onReject: console.error,
        client: client,
        config: config as Interfaces.ConfigInterface,
        url: mainCtx.url as string,
        id: mainCtx.item as string,
        decryptTags: ['mime', 'name'],
    })*/
    /**
  saveAs(
    new File(
      [newConfig],
      name,
      {type: "text/plain;charset=utf-8"}
    )
  );
  {% if type == "image" %}
  <a href="{{download}}">
    <img src="{{download}}" alt="{{object.associated.name}}" style="width:100%"/>
  </a>
{% elif type == "media" %}
  <video controls>
    <source src="{{download}}" style="width:100%">
    {% trans 'Format not supported' %}
  </video>
{% else %}
  <div style="width:100%" class="w3-padding w3-center">
    <a class="w3-margin" href="{{download}}">
      <i class="fas fa-file-download" style="font-size:300px;color: red;" aria-hidden="true"></i>
    </a>
  </div>
{% endif %}
 */
    return <></>
}

const AddFile = (props: Props) => {
    const theme = useTheme()

    return (
        <React.Fragment>
            <Card>
                <CardContent></CardContent>
            </Card>
        </React.Fragment>
    )
}

const EditFile = (props: Props) => {
    const theme = useTheme()

    return (
        <React.Fragment>
            <Card>
                <CardContent></CardContent>
            </Card>
        </React.Fragment>
    )
}

export default function ContactComponent(props: Props) {
    const { mainCtx } = React.useContext(Contexts.Main)
    if (mainCtx.action == 'view' && mainCtx.item) {
        return <ViewFile />
    } else if (mainCtx.action == 'update' && mainCtx.item) {
        return <EditFile />
    } else if (mainCtx.action == 'add') {
        return <AddFile />
    }
    return null
}
