import { UnpackPromise, ValueType } from '@secretgraph/misc/typing'
import {
    ActionInputEntry,
    CertificateInputEntry,
    annotateAndMergeMappers,
    generateActionMapper,
    mapperToArray,
} from '@secretgraph/misc/utils/action'
import { useEffect, useMemo, useState } from 'react'

export function mappersToArray(
    mappers: UnpackPromise<ReturnType<typeof generateActionMapper>>[],
    {
        lockExisting = true,
        readonlyCluster = true,
        validFor,
    }: {
        lockExisting?: boolean
        readonlyCluster?: boolean
        validFor?: string[]
    }
) {
    return useMemo(() => {
        return mapperToArray(annotateAndMergeMappers({ mappers, validFor }), {
            lockExisting,
            readonlyCluster,
        })
    }, mappers)
}

export function suspendPromiseFn<T>(
    promiseFn: () => Promise<T>,
    watch: Array<any>,
    hardSwitch?: boolean
) {
    const [result, setResult] = useState<T | undefined>(undefined)
    let [barrier, setBarrier] = useState<Promise<any> | undefined | false>(
        () => Promise.resolve()
    )
    useEffect(() => {
        let active = true
        setBarrier(
            promiseFn().then(
                (res) => {
                    if (active) {
                        barrier = undefined
                        setBarrier(undefined)
                        setResult(res)
                    }
                },
                (error) => {
                    barrier = false
                    setBarrier(false)
                    setResult(error)
                }
            )
        )
        return () => {
            active = false
            setBarrier(Promise.resolve())
        }
    }, watch)
    if (barrier && (result === undefined || hardSwitch)) {
        //throw barrier
        return null
    }
    if (barrier === false) {
        throw result
    }
    return result
}
