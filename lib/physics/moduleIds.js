// Stable aliases for modules moved between curriculum levels.
export const MODULE_ID_ALIASES = Object.freeze({
  'qm-phd-04': 'qm-grad-09',
  'qm-phd-05': 'qm-grad-10',
});

export function canonicalModuleId(id) {
  return Object.hasOwn(MODULE_ID_ALIASES, id) ? MODULE_ID_ALIASES[id] : id;
}
