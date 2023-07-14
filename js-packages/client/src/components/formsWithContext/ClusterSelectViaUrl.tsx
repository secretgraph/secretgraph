import { AutocompleteValue } from '@mui/material/useAutocomplete'
import { authInfoFromConfig } from '@secretgraph/misc/utils/config'
import * as SetOps from '@secretgraph/misc/utils/set'
import { FieldProps } from 'formik'
import * as React from 'react'

import ClusterSelect, {
    ClusterSelectProps,
} from '../../../../ui-components/src/forms/ClusterSelect'
import * as Contexts from '../../contexts'

export default function ClusterSelectViaUrl<
    Multiple extends boolean | undefined,
    DisableClearable extends boolean | undefined,
    FreeSolo extends boolean | undefined
>({
    url,
    ...props
}: Omit<ClusterSelectProps<Multiple, DisableClearable, FreeSolo>, 'tokens'> & {
    url: string
} & FieldProps<
        AutocompleteValue<string, Multiple, DisableClearable, FreeSolo>
    >) {
    const { mainCtx } = React.useContext(Contexts.Main)
    const { config } = React.useContext(Contexts.InitializedConfig)
    const clusterSelectTokens = React.useMemo(() => {
        let tokens = authInfoFromConfig({
            config,
            url,
            require: new Set(['create', 'manage']),
        }).tokens
        if (
            SetOps.hasIntersection(mainCtx.tokensPermissions, [
                'create',
                'manage',
            ])
        ) {
            tokens = [...mainCtx.tokens, ...tokens]
        }
        return tokens
    }, [config])
    return <ClusterSelect {...props} tokens={clusterSelectTokens} />
}
