declare var gettext: any

import * as Interfaces from '@secretgraph/misc/interfaces'
import * as React from 'react'

export const elements = new Map<string, Interfaces.ElementEntryInterface>([
    [
        'Cluster',
        {
            label: gettext('Cluster'),
            component: React.lazy(
                () => import(/* webpackMode: "lazy" */ './cluster')
            ),
        },
    ],
    [
        'File',
        {
            label: gettext('File'),
            component: React.lazy(
                () => import(/* webpackMode: "lazy" */ './file')
            ),
        },
    ],
    [
        'Text',
        {
            label: gettext('Text'),
            component: React.lazy(
                () => import(/* webpackMode: "lazy" */ './file')
            ),
        },
    ],
    [
        'PublicKey',
        {
            label: gettext('Keys'),
            component: React.lazy(
                () => import(/* webpackMode: "lazy" */ './keys')
            ),
        },
    ],
    [
        'undefined',
        {
            label: gettext('Custom'),
            component: React.lazy(
                () => import(/* webpackMode: "lazy" */ './custom')
            ),
        },
    ],
])
