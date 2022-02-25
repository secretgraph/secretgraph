import {
    ApolloClient,
    useApolloClient,
    useLazyQuery,
    useQuery,
} from '@apollo/client'
import GroupWorkIcon from '@mui/icons-material/GroupWork'
import ReplayIcon from '@mui/icons-material/Replay'
import TreeItem, { TreeItemProps } from '@mui/lab/TreeItem'
import { getClusterQuery } from '@secretgraph/graphql-queries/cluster'
import * as Interfaces from '@secretgraph/misc/interfaces'
import * as React from 'react'

import * as Contexts from '../../contexts'
import SideBarContents from './contents'

export default React.memo(function ActiveCluster({
    authinfo,
    cluster,
    goTo,
    ...props
}: {
    authinfo?: Interfaces.AuthInfoInterface
    cluster: string
    goTo: (node: any) => void
} & Omit<TreeItemProps, 'label' | 'onDoubleClick'>) {
    const [data, setData] = React.useState<any>(undefined)
    const { mainCtx } = React.useContext(Contexts.Main)
    const {
        refetch,
        data: dataUnfinished,
        loading,
    } = useQuery(getClusterQuery, {
        //pollInterval: ,
        variables: {
            id: cluster,
            authorization: authinfo?.tokens,
        },
        onError: console.error,
    })
    React.useEffect(() => {
        if (dataUnfinished && dataUnfinished.secretgraph.node) {
            setData({
                name: dataUnfinished.secretgraph.node.name,
                description: dataUnfinished.secretgraph.node.description,
                node: dataUnfinished.secretgraph.node,
            })
        }
    }, [dataUnfinished])

    React.useEffect(() => {
        if (data && mainCtx.type == 'Cluster') {
            refetch()
        }
    }, [mainCtx.updateId])
    return (
        <SideBarContents
            goTo={goTo}
            authinfo={authinfo}
            deleted={data?.node?.deleted}
            marked
            disabled={loading}
            title={data?.description}
            icon={<GroupWorkIcon fontSize="small" />}
            label={data?.name ? data?.name : `...${cluster.slice(-48)}`}
            onClick={(ev) => {
                ev.preventDefault()
            }}
            onDoubleClick={(ev) => {
                ev.preventDefault()
                ev.stopPropagation()
                data?.node && goTo({ ...data?.node, title: data?.name })
            }}
            refetchNotify={refetch}
            cluster={cluster}
            // state public needs no key_hash
            injectStates={['public']}
            {...props}
        />
    )
})
