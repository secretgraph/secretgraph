import { useQuery } from '@apollo/client'
import GroupWorkIcon from '@mui/icons-material/GroupWork'
import ReplayIcon from '@mui/icons-material/Replay'
import TreeItem, { TreeItemProps } from '@mui/lab/TreeItem'
import { getClusterQuery } from '@secretgraph/graphql-queries/cluster'
import * as Constants from '@secretgraph/misc/constants'
import * as Interfaces from '@secretgraph/misc/interfaces'
import * as React from 'react'

import * as Contexts from '../../contexts'
import SideBarContents from './contents'
import SidebarTreeItemLabel from './SidebarTreeItemLabel'

// not in use, maybe remove

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
        <TreeItem
            label={
                <SidebarTreeItemLabel
                    title={data?.node?.description || undefined}
                    deleted={data?.node?.deleted}
                    marked
                    leftIcon={<GroupWorkIcon fontSize="small" />}
                >
                    {data?.node?.name
                        ? data.node.name
                        : `...${cluster.slice(-48)}`}
                </SidebarTreeItemLabel>
            }
            onClick={(ev) => {
                ev.preventDefault()
                ev.stopPropagation()
            }}
            onDoubleClick={(ev) => {
                ev.preventDefault()
                ev.stopPropagation()
                goTo({ ...data?.node, title: data?.name })
            }}
            {...props}
        >
            <SideBarContents
                goTo={goTo}
                cluster={cluster}
                heading
                deleted={data?.node?.deleted}
                public={Constants.UseCriteriaPublic.TRUE}
                label="Public"
                nodeId={`${props.nodeId}-public`}
            />
            <SideBarContents
                goTo={goTo}
                cluster={cluster}
                authinfo={authinfo}
                heading
                deleted={data?.node?.deleted}
                label="Private"
                nodeId={`${props.nodeId}-private`}
                public={Constants.UseCriteriaPublic.FALSE}
                onClick={(ev) => ev.preventDefault()}
            />
        </TreeItem>
    )
})
