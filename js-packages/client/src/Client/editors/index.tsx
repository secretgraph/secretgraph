declare var gettext: any

import * as Interfaces from '@secretgraph/misc/interfaces'
import * as React from 'react'

const Loading = React.lazy(
    () => import(/*  webpackChunkName: 'loading-types' */ './loading')
)

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
        'PrivateKey',
        {
            label: gettext('Keys'),
            ignore: true,
            component: React.lazy(
                () => import(/* webpackChunkName: 'keys-editor' */ './keys')
            ),
        },
    ],
    [
        'Config',
        {
            label: gettext('Config'),
            ignore: true,
            component: React.lazy(
                () => import(/* webpackChunkName: 'keys-editor' */ './config')
            ),
        },
    ],
    [
        'custom',
        {
            label: gettext('Custom'),
            component: React.lazy(
                () =>
                    import(/*  webpackChunkName: 'custom-editor' */ './custom')
            ),
        },
    ],
    [
        'loading',
        {
            label: gettext('Loading'),
            ignore: true,
            component: Loading,
        },
    ],
    [
        'undefined',
        {
            label: gettext('Loading'),
            ignore: true,
            component: Loading,
        },
    ],
])
