declare var gettext: any

import { elements } from '@secretgraph/client/Client/editors'
import * as React from 'react'

export function init() {
    elements.set('Source', {
        label: gettext('Source'),
        component: React.lazy(
            () => import('@secretgraph/rdf-editors/editors/source')
        ),
    })

    elements.set('Contact', {
        label: gettext('Contact'),
        component: React.lazy(
            () => import('@secretgraph/rdf-editors/editors/contact')
        ),
    })

    elements.set('Postbox', {
        label: gettext('Postbox'),
        component: React.lazy(
            () => import('@secretgraph/rdf-editors/editors/postbox')
        ),
    })

    elements.set('Message', {
        label: gettext('Message'),
        component: React.lazy(
            () => import('@secretgraph/rdf-editors/editors/source')
        ),
    })
}
