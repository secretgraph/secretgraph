declare var gettext: any;

import * as React from "react"

import { editSource, viewSource } from "./source"

export const elements = new Map([
  ['source', { label: gettext('Source'), edit: editSource, view: viewSource }],
  ['file', { label: gettext('File') }],
  ['text', { label: gettext('Text') }],
  ['postbox', { label: gettext('Postbox') }],
  ['contact', { label: gettext('Contact') }],
  ['message', { label: gettext('Message') }]
]);
