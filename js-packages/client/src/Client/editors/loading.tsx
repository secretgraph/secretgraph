import {
    useApolloClient,
} from '@apollo/client'
import {
    findPublicKeyQuery,
} from '@secretgraph/graphql-queries/content'
import * as React from 'react'

import * as Contexts from '../contexts'

export default function LoadingComponent() {
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const client = useApolloClient()
    React.useEffect(() => {
        let active = true
        const f = async () => {
            if(["update", "view"].includes(mainCtx.action)){
                if(mainCtx.item){
                    try {
                        const result = await client.query({
                            query: findPublicKeyQuery,
                            variables: {
                                authorization: mainCtx.tokens,
                                id: mainCtx.item,
                            },
                        })
                        if (active) {
                            if (result.data.secretgraph.node) {
                                if(result.data.secretgraph.node.type){
                                    updateMainCtx({type: result.data.secretgraph.node.type})
                                } else {
                                    updateMainCtx({item: null, type: result.data.secretgraph.node.__typename})
                                }
                            } else {
                                updateMainCtx({item: null, type: "Cluster"})
                            }
                        }    
                    } catch(exc){
                        console.error("failed to determinate type", exc)
                    }
                    
                } else {
                    updateMainCtx({item: null, type: "Cluster"})
                }
            } else {
                updateMainCtx({item: null, type: "Cluster"})
            }
        }
        f()
        return () => {
            active = false
        }
    }, [mainCtx.url, mainCtx.item])
    return null
}
