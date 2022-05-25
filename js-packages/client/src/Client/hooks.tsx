import { UnpackPromise, ValueType } from '@secretgraph/misc/typing'
import {
    ActionInputEntry,
    CertificateInputEntry,
    generateActionMapper,
} from '@secretgraph/misc/utils/action'
import { useEffect, useMemo, useState } from 'react'

export function mapperToArray(
    mapper: UnpackPromise<ReturnType<typeof generateActionMapper>>,
    {
        lockExisting = true,
        readonlyCluster = true,
    }: { lockExisting?: boolean; readonlyCluster?: boolean }
) {
    return useMemo(() => {
        const actions: (ActionInputEntry | CertificateInputEntry)[] = []
        Object.values<ValueType<typeof mapper>>(mapper).forEach((params) => {
            const entry = mapper[params.newHash]
            if (entry.type == 'action') {
                for (const val of entry.actions) {
                    const [actionType, isCluster] = val.split(",", 2)
                    actions.push({
                        type: 'action',
                        data: params.data,
                        newHash: params.newHash,
                        oldHash: params.oldHash || undefined,
                        start: '',
                        stop: '',
                        note: entry.note,
                        value: {
                            action: actionType,
                        },
                        update: entry.hasUpdate,
                        delete: false,
                        readonly: isCluster == 'true' && readonlyCluster,
                        locked: lockExisting,
                    })
                }
            } else {
                actions.push({
                    type: 'certificate',
                    data: params.data,
                    newHash: params.newHash,
                    oldHash: params.oldHash || undefined,
                    note: entry.note,
                    update: entry.hasUpdate,
                    delete: false,
                    readonly: false,
                    locked: true,
                })
            }
        })
        return actions
    }, [mapper])
}

export function suspendPromiseFn<T>(
    promiseFn: () => Promise<T>,
    watch: Array<any>,
    hardSwitch?: boolean
) {
    const [result, setResult] = useState<T | undefined>(undefined)
    let [barrier, setBarrier] = useState<Promise<any> | undefined | false>(() =>
        Promise.resolve()
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
