import { convertColorToString } from "material-ui/utils/colorManipulator";

declare var gettext: any;

export const contentStates = new Map([
  ['default', { label: gettext('Default') }],
  ['draft', { label: gettext('Draft') }],
  ['internal', {label: gettext('Internal') }],
  ['public', { label: gettext('Public') }],
]);

export const mapHashNames: { [algo: string]: string } = {
  "sha512": "SHA-512" as const,
  "SHA-512": "SHA-512" as const,
  "sha256": "SHA-256" as const,
  "SHA-256": "SHA-256" as const
}
