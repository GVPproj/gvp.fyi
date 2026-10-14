import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { softwareProjects } from '../src/data/software-projects.ts';

/** Checked-in migration inventory only; never used as a published-mode fallback. */
export async function editorialInventory() {
  const settings = JSON.parse(await readFile(new URL('../src/data/site-settings.json', import.meta.url), 'utf8'));
  const source = await readFile(new URL('../src/content/blog/the-animated-face.mdx', import.meta.url), 'utf8');
  const title = source.match(/^title: (.+)$/m)[1];
  const markdown = source.replace(/^---\n[\s\S]*?\n---\n/, '')
    .replace('import Face from "@src/components/Face.astro";', '')
    .replace('<Face />', '<!-- demo:face -->')
    .replace('{frontmatter.title}', title)
    .replace('<a href="https://sophiaburke.ca/" target="_blank" rel="noopener noreferrer">Sophia</a>', '[Sophia](https://sophiaburke.ca/)').trim();
  return [
    ...softwareProjects.map((project, order) => {
      const files = [project.screenshot, ...(project.gallery ?? []).map(image => image.src)];
      return {
        kind: 'software', slug: project.slug,
        data: { ...project, order, screenshotAlt: `Screenshot of ${project.title}` },
        assets: files.map(path => ({ name: basename(path), source: path })),
      };
    }),
    { kind: 'blog', slug: 'the-animated-face', data: { title, markdown }, assets: [] },
    { kind: 'settings', slug: 'site', data: settings, assets: [] },
  ];
}
