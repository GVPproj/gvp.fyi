/** Complete current Likes wire record; malformed tests remove fields explicitly. */
export function currentLike(id, data, assets = []) {
  return { id, data: { id, title: '', url: '', description: '', commentary: '', type: '', body: '',
    attribution: '', created: '2026-01-01 12:00:00.000Z', updated: '2026-01-01 12:00:00.000Z',
    asset: '', collections: [], ...data }, assets };
}
