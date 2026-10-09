/** Stable sound IDs shared by live pads, recorded events and either voice mode. */
export const pads: { id: string; label: string; frequency: number; sampleUrl: string }[] = [
  ['C3', 48], ['D3', 50], ['E3', 52], ['G3', 55], ['A3', 57],
  ['C4', 60], ['D4', 62], ['E4', 64], ['G4', 67], ['A4', 69],
  ['C5', 72], ['D5', 74], ['E5', 76], ['G5', 79], ['A5', 81], ['C6', 84],
].map(([note, midi]) => ({
  id: String(note).toLowerCase(),
  label: String(note),
  frequency: 440 * 2 ** ((Number(midi) - 69) / 12),
  sampleUrl: `/audio/ambient-test/${String(note).toLowerCase()}.wav`,
}));
