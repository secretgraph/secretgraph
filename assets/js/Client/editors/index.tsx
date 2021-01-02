declare var gettext: any

import * as React from 'react'
import { ElementEntryInterface } from '../interfaces'

export const elements = new Map([
    [
        'Source',
        {
            label: gettext('Source'),
            component: React.lazy(() => import('./source')),
        },
    ],
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
        'Contact',
        {
            label: gettext('Contact'),
            component: React.lazy(() => import('./contact')),
        },
    ],
    [
        'PublicKey',
        {
            label: gettext('Keys'),
            component: React.lazy(() => import('./keys')),
        },
    ],
    [
        'Postbox',
        {
            label: gettext('Postbox'),
            component: React.lazy(() => import('./postbox')),
        },
    ],
    [
        'Message',
        {
            label: gettext('Message'),
            component: React.lazy(() => import('./source')),
        },
    ],
    [
        'undefined',
        {
            label: gettext('Custom'),
            component: React.lazy(() => import('./custom')),
        },
    ],
] as [string, ElementEntryInterface][])
