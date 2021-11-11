import { useEffect, useState } from 'react'

export function suspendPromiseFn<T>(
    promiseFn: () => Promise<T>,
    watch: Array<any>,
    hardSwitch?: boolean
) {
    const [result, setResult] = useState<T | undefined>(undefined)
    let [barrier, setBarrier] = useState<Promise<any> | undefined | false>(
        Promise.resolve
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
        throw barrier
    }
    if (barrier === false) {
        throw result
    }
    return result
}
