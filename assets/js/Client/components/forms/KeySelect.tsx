import { Value } from '@material-ui/core'
import { Field, FieldProps } from 'formik'
import * as React from 'react'

import { InitializedConfig } from '../../contexts'
import { clusterFeedQuery } from '../../queries/cluster'
import { extractPublicInfo } from '../../utils/cluster'
import { extractAuthInfo } from '../../utils/config'
import SimpleSelect, { SimpleSelectProps } from './SimpleSelect'

export interface KeySelectProps<
    Multiple extends boolean | undefined,
    DisableClearable extends boolean | undefined,
    FreeSolo extends boolean | undefined
> extends Omit<
        SimpleSelectProps<string, Multiple, DisableClearable, FreeSolo>,
        'options' | 'getOptionLabel' | 'loading'
    > {
    url: string
    cluster?: string
    type?: 'privateKey' | 'publicKey'
    firstIfEmpty?: boolean
}

export default function KeySelect<
    Multiple extends boolean | undefined,
    DisableClearable extends boolean | undefined,
    FreeSolo extends boolean | undefined
>({
    url,
    cluster,
    type,
    firstIfEmpty,
    ...props
}: KeySelectProps<Multiple, DisableClearable, FreeSolo> &
    FieldProps<Value<string, Multiple, DisableClearable, FreeSolo>>) {}
