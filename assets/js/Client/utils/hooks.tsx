import {
    DocumentNode,
    OperationVariables,
    QueryHookOptions,
    TypedDocumentNode,
    useQuery,
} from '@apollo/client'
import * as React from 'react'

export function fixedUseQuery<TData = any, TVariables = OperationVariables>(
    query: DocumentNode | TypedDocumentNode<TData, TVariables>,
    _props?: QueryHookOptions<TData, TVariables>
) {
    const { onCompleted, ...props } = _props
        ? _props
        : { onCompleted: undefined }
    const { data, ...result } = useQuery<TData, TVariables>(query, props)
    onCompleted &&
        React.useEffect(() => {
            data && onCompleted(data)
        }, [data])

    return { data, ...result }
}
