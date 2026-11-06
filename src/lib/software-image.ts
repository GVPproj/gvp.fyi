import { getImage } from 'astro:assets';
import type { ImageMetadata } from 'astro';

/** Preserve the software templates' native img contract using Astro-owned assets. */
export async function softwareImage(source: ImageMetadata) {
  const widths = [...new Set([160, 320, 640, 960, source.width].filter(width => width <= source.width))];
  const image = await getImage({ src: source, widths, format: 'webp', quality: 80 });
  return { src: source.src, srcset: image.srcSet.attribute, width: source.width, height: source.height };
}
