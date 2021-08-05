declare var gettext: any

import * as Interfaces from '@secretgraph/misc/lib/interfaces'
import * as React from 'react'

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
            component: React.lazy(() => import('./keys')),
        },
    ],
    [
        'undefined',
        {
            label: gettext('Custom'),
            component: React.lazy(() => import('./custom')),
        },
    ],
])

/**
 * 
    [
        'Source',
        {
            label: gettext('Source'),
            component: React.lazy(() => import('./source')),
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
 */
