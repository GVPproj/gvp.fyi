import { getImage } from 'astro:assets';
import type { ImageMetadata } from 'astro';

/** Shared Likes/music image sizes; a ceiling-height box avoids rounded-ratio crops. */
export async function contentImage(source: ImageMetadata, preserved: ImageMetadata[] = []) {
  const widths = [...new Set([160, 320, 640, 960, source.width].filter(width => width <= source.width))]
    .sort((a, b) => a - b);
  const seen = new Set<number>();
  for (const variant of preserved) {
    if (seen.has(variant.width)) throw new Error(`Duplicate image variant width ${variant.width}: ${variant.src}`);
    seen.add(variant.width);
    if (!widths.includes(variant.width)) throw new Error(`Unexpected image variant width ${variant.width}: ${variant.src}`);
    const height = variant.width * source.height / source.width;
    if (variant.height < Math.floor(height) || variant.height > Math.ceil(height)) {
      throw new Error(`Image variant must be proportional to its primary image: ${variant.src}`);
    }
  }
  const variants = await Promise.all(widths.map(width => preserved.find(variant => variant.width === width) ?? getImage({
    src: source, width, height: Math.ceil(width * source.height / source.width),
    fit: 'inside', format: 'webp', quality: 80,
  })));
  return {
    src: variants.at(-1)!.src,
    thumbnail: variants[widths.findIndex(width => width >= 320)]?.src ?? variants.at(-1)!.src,
    srcset: variants.map((variant, index) => `${variant.src} ${widths[index]}w`).join(', '),
    width: source.width,
    height: source.height,
  };
}
