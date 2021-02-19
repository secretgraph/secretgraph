import { gql, useLazyQuery, useQuery } from '@apollo/client'
import { Field, FieldProps } from 'formik'
import * as React from 'react'

import { InitializedConfigContext } from '../../contexts'
import { clusterFeedQuery } from '../../queries/cluster'
import { extractPublicInfo } from '../../utils/cluster'
import { extractAuthInfo } from '../../utils/config'
import SimpleSelect, { SimpleSelectProps } from './SimpleSelect'

export interface KeySelectProps<
    Multiple extends boolean | undefined,
    DisableClearable extends boolean | undefined,
    FreeSolo extends boolean | undefined
> extends Omit<
        SimpleSelectProps<Multiple, DisableClearable, FreeSolo, string>,
        'options' | 'getOptionLabel' | 'loading'
    > {
    url: string
    cluster?: string
    type?: 'privateKey' | 'publicKey'
    firstIfEmpty?: boolean
}

export default function ClusterSelect<
    Multiple extends boolean | undefined,
    DisableClearable extends boolean | undefined,
    FreeSolo extends boolean | undefined,
    V
>({
    url,
    cluster,
    type,
    firstIfEmpty,
    ...props
}: KeySelectProps<Multiple, DisableClearable, FreeSolo> & FieldProps<V>) {}
