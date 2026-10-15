/** Stable sound IDs shared by live pads and recorded events. */
export const pads: { id: string; label: string; frequency: number }[] = [
  ['A3', 57],
  ['C4', 60], ['D4', 62], ['E4', 64], ['G4', 67], ['A4', 69],
  ['C5', 72], ['D5', 74], ['E5', 76], ['G5', 79], ['A5', 81], ['C6', 84],
].map(([note, midi]) => ({
  id: String(note).toLowerCase(),
  label: String(note),
  frequency: 440 * 2 ** ((Number(midi) - 69) / 12),
}));
