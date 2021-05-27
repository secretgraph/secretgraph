import {
    DocumentNode,
    OperationVariables,
    QueryHookOptions,
    QueryResult,
    TypedDocumentNode,
    useQuery,
} from '@apollo/client'
import * as React from 'react'

export function useFixedQuery<TData = any, TVariables = OperationVariables>(
    query: DocumentNode | TypedDocumentNode<TData, TVariables>,
    _props?: Omit<QueryHookOptions<TData, TVariables>, 'onCompleted'> & {
        onCompleted?: (data: TData) => void | PromiseLike<void>
    }
): QueryResult<TData, TVariables> {
    const { onCompleted, ...props } = _props
        ? _props
        : { onCompleted: undefined }
    const { data, refetch, loading, ...result } = useQuery<TData, TVariables>(
        query,
        props
    )
    onCompleted &&
        React.useEffect(() => {
            data && !loading && onCompleted(data)
        }, [data, loading])
    /**const refetch = async (...args: Parameters<typeof refetchFn>) => {
        const result = await refetchFn()
        onCompleted && (await onCompleted(result.data))
        return result
    }*/

    return { data, loading, refetch, ...result }
}
