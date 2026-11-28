import type { LabelMap } from './labels';

export type Visibility = 'draft' | 'published' | 'unpublished';
export type UserRole = 'owner' | 'editor' | 'viewer';

export interface EntityBase {
  id: string;
  visibility: Visibility;
  order: number;
  featured: boolean;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  deletedAt: string | null;
}

export interface Project extends EntityBase {
  title: string;
  slug: string;
  summary: string;
  description: string;
  category: string;
  status: string;
  coverImage: string;
  gallery: string[];
  technologies: string[];
  githubUrl: string;
  liveUrl: string;
}

export interface Experience extends EntityBase {
  role: string;
  organization: string;
  location: string;
  employmentType: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  description: string;
  highlights: string[];
  tags: string[];
  logo: string;
  certificate: string;
}

export interface Education extends EntityBase {
  degree: string;
  institution: string;
  location: string;
  period: string;
  status: string;
  details: string;
  coursework: string[];
  achievementNote: string;
}

export interface SkillCategory extends EntityBase {
  title: string;
  description: string;
  colourToken: string;
}

export interface Skill extends EntityBase {
  categoryId: string;
  name: string;
  note: string;
}

export interface Achievement extends EntityBase {
  type: 'certificate' | 'achievement' | 'community';
  title: string;
  issuer: string;
  issueDate: string;
  expiryDate: string;
  credentialId: string;
  description: string;
  verificationUrl: string;
  file: string;
}

export interface SocialLink extends EntityBase {
  platform: string;
  label: string;
  url: string;
  iconKey: string;
  visible: boolean;
}

export interface AboutRecord {
  headline: string;
  subheadline: string;
  bio: string;
  intro: string;
  availability: string;
  location: string;
  careerDirection: string;
  profileImage: string;
  interests: string[];
  currentlyLearning: string[];
  updatedAt: string;
}

export interface SiteSettings {
  siteTitle: string;
  siteDescription: string;
  contactEmail: string;
  location: string;
  timezone: string;
  footerNote: string;
  navItems: Array<{ label: string; section: string; visible: boolean }>;
  cta: { label: string; url: string };
  sectionVisibility: Record<string, boolean>;
  sectionHeadings?: Partial<Record<string, string | {
    heading?: string;
    title?: string;
    kicker?: string;
    label?: string;
  }>>;
  labels?: LabelMap;
  sectionOrder?: string[];
  currentlyLines?: string[];
  approach?: Array<{ id: string; number?: string; title?: string; source?: string; body?: string }>;
  community?: { heading?: string; kicker?: string; notice?: string; learningLabel?: string };
  appearance: {
    accent: string;
    grain: boolean;
    loader: boolean;
    terminal: boolean;
    emberDensity: 'low' | 'medium' | 'high';
  };
  ogImage: string;
  updatedAt: string;
}

export interface MediaAsset {
  id: string;
  path: string;
  bucket: 'media-public' | 'media-private';
  filename: string;
  folder: string;
  altText: string;
  mimeType: string;
  size: number;
  width: number;
  height: number;
  uploadedBy: string;
  blurDataUrl: string;
  createdAt: string;
}

export interface ActivityEntry {
  id: string;
  actor: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: string;
  createdAt: string;
}

export interface PortfolioData {
  settings: SiteSettings;
  about: AboutRecord;
  socials: SocialLink[];
  projects: Project[];
  experience: Experience[];
  education: Education[];
  skillCategories: SkillCategory[];
  skills: Skill[];
  achievements: Achievement[];
  media: MediaAsset[];
}

export type CollectionKey =
  | 'projects'
  | 'experience'
  | 'education'
  | 'skill_categories'
  | 'skills'
  | 'achievements'
  | 'social_links';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  mfaRequired?: boolean;
  aal?: string;
  factorId?: string;
}
