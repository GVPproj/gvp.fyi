// Category IDs are production site settings, not a closed application enum.
export type SoftwareProjectCategory = string;

export interface SoftwareProjectRole {
  paragraphs: string[];
}

export interface SoftwareProjectTeamMember {
  name: string;
}

export interface SoftwareProject {
  slug: string;
  title: string;
  description: string;
  tooling: string[];
  url?: string;
  repo?: string;
  category: SoftwareProjectCategory;
  order?: number;
  role?: SoftwareProjectRole;
  team?: SoftwareProjectTeamMember[];
  galleryCount?: number;
}
