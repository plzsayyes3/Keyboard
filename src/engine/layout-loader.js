export function mergeLayout(base, override) {
  return {
    ...base,
    ...override,
    physicalKeys: override.physicalKeys?.length ? override.physicalKeys : base.physicalKeys,
    layers: {
      ...base.layers,
      ...override.layers,
      single: { ...base.layers?.single, ...override.layers?.single },
      centerShift: { ...base.layers?.centerShift, ...override.layers?.centerShift }
    },
    combos: override.combos?.length ? override.combos : base.combos,
    keyboard: override.keyboard ?? base.keyboard,
    modeSwitch: override.modeSwitch ?? base.modeSwitch,
    tapDance: override.tapDance ?? base.tapDance
  };
}
