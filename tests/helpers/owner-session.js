// Structurally valid PocketBase JWT fixture; HTTP authorization remains mocked.
export function ownerResult(exp = Math.floor(Date.now() / 1000) + 3600) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return {
    token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ id: 'likesowner00001', exp })}.test-signature`,
    record: { id: 'likesowner00001', collectionName: 'likes_owners' },
  };
}
export const ownerToken = ownerResult().token;
export const ownerAuth = { ...ownerResult(), token: ownerToken };

export async function login(page) {
  const previous = new URL(page.url());
  const base = previous.origin;
  const likesURL = previous.pathname === '/likes/manage' ? previous.href : `${base}/likes/manage`;
  await page.goto(`${base}/login`);
  await page.locator('#owner-login [name=email]').fill('owner@example.test');
  await page.locator('#owner-login [name=password]').fill('owner-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(`${base}/`);
  await page.goto(likesURL);
  if (await page.locator('.owner-tools').getAttribute('open') === null) {
    await page.locator('.owner-tools summary').click();
  }
  await page.locator('#save-link').waitFor({ state: 'visible' });
}

export async function logout(page) {
  await page.getByRole('button', { name: 'Logged In', exact: true }).click();
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await page.getByRole('button', { name: 'Logged In', exact: true }).waitFor({ state: 'hidden' });
}
