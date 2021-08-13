declare var gettext: any

import { elements } from '@secretgraph/client/Client/editors'
import * as React from 'react'

elements.set('Source', {
    label: gettext('Source'),
    component: React.lazy(() => import('./source')),
})

elements.set('Contact', {
    label: gettext('Contact'),
    component: React.lazy(() => import('./contact')),
})

elements.set('Postbox', {
    label: gettext('Postbox'),
    component: React.lazy(() => import('./postbox')),
})

elements.set('Message', {
    label: gettext('Message'),
    component: React.lazy(() => import('./source')),
})
