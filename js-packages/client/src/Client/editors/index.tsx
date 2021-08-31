declare var gettext: any

import * as Interfaces from '@secretgraph/misc/interfaces'
import * as React from 'react'

export const elements = new Map<string, Interfaces.ElementEntryInterface>([
    [
        'Cluster',
        {
            label: gettext('Cluster'),
            component: React.lazy(
                () =>
                    import(/* webpackChunkName: 'cluster-editor' */ './cluster')
            ),
        },
    ],
    [
        'File',
        {
            label: gettext('File'),
            component: React.lazy(
                () => import(/* webpackChunkName: 'file-editor' */ './file')
            ),
        },
    ],
    [
        'Text',
        {
            label: gettext('Text'),
            component: React.lazy(
                () => import(/* webpackChunkName: 'file-editor' */ './file')
            ),
        },
    ],
    [
        'PublicKey',
        {
            label: gettext('Keys'),
            component: React.lazy(
                () => import(/* webpackChunkName: 'keys-editor' */ './keys')
            ),
        },
    ],
    [
        'undefined',
        {
            label: gettext('Custom'),
            component: React.lazy(
                () =>
                    import(/*  webpackChunkName: 'custom-editor' */ './custom')
            ),
        },
    ],
])
