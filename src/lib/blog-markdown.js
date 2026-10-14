import MarkdownIt from 'markdown-it';

// Raw HTML and executable MDX are deliberately disabled. Fenced examples remain text.
const markdown = new MarkdownIt({ html: false, linkify: false });
/**
 * @param {string} source
 * @param {{assets: {name: string; url: string}[], assetNames?: Record<string, string>} | undefined} media
 * @returns {({ html: string; demo?: never } | { demo: 'face'; html?: never })[]}
 */
export function renderBlogMarkdown(source, media = undefined) {
  const tokens = markdown.parse(source, {});
  if (media) {
    for (const token of tokens) for (const child of token.children ?? []) {
      if (child.type !== 'image' && child.type !== 'link_open') continue;
      const attribute = child.type === 'image' ? 'src' : 'href';
      const original = child.attrGet(attribute) ?? '';
      const external = /^(?:https?:\/\/|mailto:|\/\/)/i.test(original);
      // Reading links are destinations, not attachment aliases. External images
      // still need retained media so published pages work without their origin.
      if (child.type === 'link_open' && external) continue;
      const pathname = original.split(/[?#]/)[0];
      const basename = pathname.split('/').at(-1);
      const mapped = media.assetNames?.[basename];
      const name = mapped ?? basename;
      const asset = media.assets.find(asset => asset.name === pathname || asset.name === name);
      const relativeFile = !external && !original.startsWith('/') && !original.startsWith('#');
      const localDownload = !external && /\.(?:pdf|jpe?g|png|webp|gif)$/i.test(pathname);
      if (asset) child.attrSet(attribute, asset.url + (original.includes('#') ? `#${original.split('#').slice(1).join('#')}` : ''));
      else if (child.type === 'image' || mapped || relativeFile || localDownload) {
        throw new Error(`Missing blog asset: ${original}`);
      }
    }
  }
  let demos = 0;
  /** @type {({ html: string; demo?: never } | { demo: 'face'; html?: never })[]} */
  const parts = [];
  let prose = [];
  const flush = () => {
    if (prose.length) parts.push({ html: markdown.renderer.render(prose, markdown.options, {}) });
    prose = [];
  };
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type === 'paragraph_open' && tokens[i + 1]?.type === 'inline' &&
      tokens[i + 1].content === '<!-- demo:face -->' && tokens[i + 2]?.type === 'paragraph_close') {
      if (++demos > 1) throw new Error('Only one Face demonstration is allowed per article');
      flush();
      parts.push({ demo: 'face' });
      i += 2;
    } else prose.push(tokens[i]);
  }
  flush();
  return parts;
}
