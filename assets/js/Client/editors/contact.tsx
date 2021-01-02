import * as React from 'react'
import Card from '@material-ui/core/Card'
import CardContent from '@material-ui/core/CardContent'
import { useAsync } from 'react-async'

import { useQuery, useApolloClient } from '@apollo/client'

import { ConfigInterface } from '../interfaces'
import { MainContext, ConfigContext } from '../contexts'
import { decryptContentId } from '../utils/operations'

import { contentQuery } from '../queries/content'
import { useStylesAndTheme } from '../theme'
import { newClusterLabel } from '../messages'

type Props = {}

const ViewFile = (props: Props) => {
    const { classes, theme } = useStylesAndTheme()
    const { mainCtx } = React.useContext(MainContext)
    const client = useApolloClient()
    const { config } = React.useContext(ConfigContext)
    const { data, error } = useAsync({
        promiseFn: decryptContentId,
        suspense: true,
        client: client,
        config: config as ConfigInterface,
        url: mainCtx.url as string,
        id: mainCtx.item as string,
        decryptTags: ['mime', 'name'],
    })
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
    const { classes, theme } = useStylesAndTheme()

    return (
        <React.Fragment>
            <Card>
                <CardContent></CardContent>
            </Card>
        </React.Fragment>
    )
}

const EditFile = (props: Props) => {
    const { classes, theme } = useStylesAndTheme()

    return (
        <React.Fragment>
            <Card>
                <CardContent></CardContent>
            </Card>
        </React.Fragment>
    )
}

export default function ContactComponent(props: Props) {
    const { mainCtx } = React.useContext(MainContext)
    if (mainCtx.action == 'view' && mainCtx.item) {
        return <ViewFile />
    } else if (mainCtx.action == 'edit' && mainCtx.item) {
        return <EditFile />
    } else if (mainCtx.action == 'add') {
        return <AddFile />
    }
    return null
}
