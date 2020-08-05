declare var gettext: any;

import * as React from "react"

import { editSource, viewSource } from "./source"

export const elements = new Map([
  ['Source', { label: gettext('Source'), edit: editSource, view: viewSource }],
  ['Cluster', { label: gettext('Cluster') }],
  ['File', { label: gettext('File') }],
  ['Postbox', { label: gettext('Postbox') }],
  ['Contact', { label: gettext('Contact') }],
  ['Message', { label: gettext('Message') }]
]);
