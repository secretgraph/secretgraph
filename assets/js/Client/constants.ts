declare var gettext: any;

export const contentStates = new Map([
  ['default', { label: gettext('Default') }],
  ['draft', { label: gettext('Draft') }],
  ['internal', {label: gettext('Internal') }],
  ['public', { label: gettext('Public') }],
]);
