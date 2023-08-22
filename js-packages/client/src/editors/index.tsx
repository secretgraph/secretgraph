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
        'ChannelStore',
        {
            label: gettext('ChannelStore'),
            ignore: true,
            component: React.lazy(() => import('./ChannelStore')),
        },
    ],
    [
        'WorkDay',
        {
            label: gettext('Workday'),
            component: React.lazy(() => import('./Workday')),
        },
    ],
    [
        ':custom',
        {
            label: gettext('Custom'),
            component: React.lazy(() => import('./custom')),
        },
    ],
    [
        ':loading',
        {
            label: gettext('Loading'),
            ignore: true,
            component: Loading,
        },
    ],
])

export function getEditor(
    type: string | null | undefined
): Interfaces.ElementEntryInterface {
    let FrameElementWrapper = elements.get(type ? String(type) : ':loading')
    if (!FrameElementWrapper) {
        FrameElementWrapper = elements.get(
            ':custom'
        ) as Interfaces.ElementEntryInterface
    }
    return FrameElementWrapper
}
