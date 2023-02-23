declare var gettext: any

import * as Interfaces from '@secretgraph/misc/interfaces'
import * as React from 'react'

const Loading = React.lazy(() => import('./loading'))
const Keys = React.lazy(() => import('./keys'))

export const elements = new Map<string, Interfaces.ElementEntryInterface>([
    [
        'Cluster',
        {
            label: gettext('Cluster'),
            component: React.lazy(() => import('./cluster')),
        },
    ],
    [
        'File',
        {
            label: gettext('File'),
            component: React.lazy(() => import('./file')),
        },
    ],
    [
        'Text',
        {
            label: gettext('Text'),
            component: React.lazy(() => import('./file')),
        },
    ],
    [
        'PublicKey',
        {
            label: gettext('Keys'),
            component: Keys,
        },
    ],
    [
        'PrivateKey',
        {
            label: gettext('Keys'),
            ignore: true,
            component: Keys,
        },
    ],
    [
        'Config',
        {
            label: gettext('Config'),
            ignore: true,
            component: React.lazy(() => import('./config')),
        },
    ],
    [
        'custom',
        {
            label: gettext('Custom'),
            component: React.lazy(() => import('./custom')),
        },
    ],
    [
        'ChannelStore',
        {
            label: gettext('ChannelStore'),
            ignore: true,
            component: React.lazy(() => import('./ChannelStore')),
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
