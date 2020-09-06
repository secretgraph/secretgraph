declare var gettext: any;

import * as React from "react"
import { ElementEntryInterface } from "../../interfaces"


export const elements = new Map([
  ['Source', { label: gettext('Source'), component: React.lazy(() => import("./source")) }],
  ['Cluster', { label: gettext('Cluster'), component: React.lazy(() => import("./cluster")) }],
  ['File', { label: gettext('File'), component: React.lazy(() => import("./file")) }],
  ['Postbox', { label: gettext('Postbox'), component: React.lazy(() => import("./source")) }],
  ['Contact', { label: gettext('Contact'), component: React.lazy(() => import("./source")) }],
  ['Message', { label: gettext('Message'), component: React.lazy(() => import("./source")) }],
  ['undefined', { label: gettext('Custom'), component: React.lazy(() => import("./custom")) }]
] as [string, ElementEntryInterface][]);
