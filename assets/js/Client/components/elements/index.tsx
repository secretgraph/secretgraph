declare var gettext: any;

import * as React from "react"

import { editSource, viewSource } from "./source"

export const elements = new Map([
  ['source', { label: gettext('Source'), edit: editSource, view: viewSource }],
  ['cluster', { label: gettext('Cluster') }],
  ['file', { label: gettext('File') }],
  ['postbox', { label: gettext('Postbox') }],
  ['contact', { label: gettext('Contact') }],
  ['message', { label: gettext('Message') }]
]);
