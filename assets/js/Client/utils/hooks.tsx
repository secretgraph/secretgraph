import {
    DocumentNode,
    OperationVariables,
    QueryHookOptions,
    QueryResult,
    TypedDocumentNode,
    useQuery,
} from '@apollo/client'
import * as React from 'react'

// still broken
export function useFixedQuery<TData = any, TVariables = OperationVariables>(
    query: DocumentNode | TypedDocumentNode<TData, TVariables>,
    _props?: Omit<QueryHookOptions<TData, TVariables>, 'onCompleted'> & {
        onCompleted?: (data: TData) => void | PromiseLike<void>
    }
): QueryResult<TData, TVariables> {
    const { onCompleted, ...props } = _props
        ? _props
        : { onCompleted: undefined }
    let {
        data,
        refetch: refetchFn,
        loading,
        ...other
    } = useQuery<TData, TVariables>(query, props)
    const refetch = async (...args: Parameters<typeof refetchFn>) => {
        const result = await refetchFn(...args)
        data = result.data
        loading = false
        return result
    }

    onCompleted &&
        React.useEffect(() => {
            data && !loading && onCompleted(data)
        }, [data, loading])
    return { data, loading, refetch, ...other }
}
