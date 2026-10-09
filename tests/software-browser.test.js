import assert from 'node:assert/strict';
import test from 'node:test';
import { softwareProjects } from '../src/data/software-projects.ts';
import { realBrowser, browserOptions } from './helpers/real-browser.js';

const categoryNames = { portfolio: 'Applications', 'small-websites': 'Small websites', 'early-projects': 'Early projects' };

async function blockExternalRequests(context, base) {
  await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
}

test('Software orders Applications, Small websites and Early projects and rows scroll with keyboard focus on mobile and desktop', browserOptions, async t => {
  const { base, context, page } = await realBrowser(t);
  await blockExternalRequests(context, base);
  await page.goto(`${base}/software`);
  // Let Vite's initial dependency loading settle before inspecting all rows.
  await page.waitForLoadState('networkidle');
  await page.getByRole('heading', { name: 'Software', exact: true }).waitFor();
  const portfolio = page.getByRole('region', { name: 'Applications', exact: true });
  const small = page.getByRole('region', { name: 'Small websites', exact: true });
  const early = page.getByRole('region', { name: 'Early projects', exact: true });
  assert.deepEqual(await page.locator('.software > section h2').allTextContents(), ['Applications', 'Small websites', 'Early projects']);
  assert.equal(await portfolio.getByRole('link').count(), 2);
  assert.equal(await portfolio.locator('a[href="/software/tipbox"]').count(), 1);
  assert.equal(await portfolio.locator('a[href="/software/biolink"]').count(), 1);
  assert.equal(await portfolio.locator('.content-row-info p').textContent(), '2 projects');
  assert.equal(await small.getByRole('link').count(), 1);
  assert.equal(await small.locator('a[href="/software/groundwaves"]').count(), 1);
  assert.equal(await small.locator('.content-row-info p').textContent(), '1 project');
  assert.equal(await early.getByRole('link').count(), 4);
  assert.equal(await early.locator('.content-row-info p').textContent(), '4 projects');
  for (const project of softwareProjects) {
    const row = page.getByRole('region', { name: categoryNames[project.category], exact: true });
    const link = row.locator(`a[href="/software/${project.slug}"]`);
    assert.ok((await link.textContent()).includes(project.title));
    assert.equal(await link.locator('img').getAttribute('src'), project.screenshot);
    await link.locator('img').evaluate(image => image.decode());
  }
  for (const width of [1280, 320]) {
    await page.setViewportSize({ width, height: 800 });
    for (const row of [portfolio, small, early]) {
      const count = await row.getByRole('link').count();
      await row.getByRole('link').first().focus();
      for (let index = 1; index < count; index++) await page.keyboard.press('Tab');
      const last = row.getByRole('link').last();
      assert.equal(await last.evaluate(link => document.activeElement === link), true);
      const bounds = await last.evaluate(link => {
        const rect = link.getBoundingClientRect();
        return { left: rect.left, right: rect.right, viewport: innerWidth };
      });
      assert.ok(bounds.left >= 0 && bounds.right <= bounds.viewport, `${await row.getAttribute('aria-labelledby')} at ${width}px: ${JSON.stringify(bounds)}`);
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  }
  await portfolio.getByRole('link').first().click();
  await page.getByRole('heading', { name: softwareProjects[0].title, level: 1, exact: true }).waitFor();
  assert.equal(await page.locator('#site-nav a[href="/software"]').getAttribute('aria-current'), 'page');
  await page.getByRole('main').getByRole('link', { name: '← Software', exact: true }).click();
  await page.getByRole('heading', { name: 'Software', exact: true }).waitFor();
});

test('All software detail pages preserve portfolio information and work without JavaScript', browserOptions, async t => {
  const { base, context } = await realBrowser(t);
  const native = await context.browser().newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 700 } });
  t.after(() => native.close());
  await blockExternalRequests(native, base);
  const page = await native.newPage();
  page.setDefaultTimeout(5000);
  for (const project of softwareProjects) {
    await page.goto(`${base}/software`);
    const row = page.getByRole('region', { name: categoryNames[project.category], exact: true });
    await row.locator(`a[href="/software/${project.slug}"]`).click();
    const main = page.getByRole('main');
    await main.getByRole('heading', { name: project.title, level: 1, exact: true }).waitFor();
    assert.ok((await main.textContent()).includes(project.description));
    for (const tool of project.tooling) assert.ok((await main.locator('.tooling').textContent()).includes(tool));
    for (const [property, label] of [['url', 'Visit website'], ['repo', 'GitHub repository']]) {
      assert.equal(await main.getByRole('link', { name: label, exact: true }).count(), project[property] ? 1 : 0);
      if (project[property]) assert.equal(await main.getByRole('link', { name: label, exact: true }).getAttribute('href'), project[property]);
    }
    if (project.role) {
      assert.ok((await main.textContent()).includes(project.role.paragraphs[0]));
      for (const member of project.team) assert.ok((await main.textContent()).includes(member.name));
    }
    const images = main.getByRole('img');
    assert.equal(await images.count(), 1 + (project.gallery?.length ?? 0));
    for (const image of await images.all()) await image.evaluate(element => element.decode());
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await main.getByRole('link', { name: '← Software', exact: true }).click();
    await page.getByRole('heading', { name: 'Software', exact: true }).waitFor();
  }
  assert.equal((await page.goto(`${base}/software/not-a-project`)).status(), 404);
});
