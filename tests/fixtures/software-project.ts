// Category IDs are production site settings, not a closed application enum.
export type SoftwareProjectCategory = string;

export interface SoftwareProjectRole {
  title: string;
  paragraphs: string[];
}

export interface SoftwareProjectTeamMember {
  name: string;
  role: string;
  href?: string;
}

export interface SoftwareProjectImage {
  src: string;
  srcset?: string;
  alt: string;
  width: number;
  height: number;
}

export interface SoftwareProject {
  slug: string;
  title: string;
  description: string;
  screenshot: string;
  screenshotSrcset?: string;
  screenshotAlt?: string;
  screenshotWidth: number;
  screenshotHeight: number;
  tooling: string[];
  url?: string;
  repo?: string;
  category: SoftwareProjectCategory;
  order?: number;
  role?: SoftwareProjectRole;
  tagline?: string;
  team?: SoftwareProjectTeamMember[];
  gallery?: SoftwareProjectImage[];
}
