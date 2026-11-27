import type { CollectionKey } from './types';

export type FieldType =
  | 'text'
  | 'textarea'
  | 'url'
  | 'tags'
  | 'media'
  | 'media-list'
  | 'select'
  | 'boolean'
  | 'date'
  | 'number';

export interface FieldConfig {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  help?: string;
  options?: Array<{ value: string; label: string }>;
}

export interface CollectionConfig {
  key: CollectionKey;
  label: string;
  singular: string;
  icon: string;
  fields: FieldConfig[];
  hasVisibility: boolean;
  hasOrder: boolean;
  hasFeatured: boolean;
  titleField: string;
}

const visibilityOptions = [
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'unpublished', label: 'Unpublished' },
];

export const collections: CollectionConfig[] = [
  {
    key: 'projects',
    label: 'Projects',
    singular: 'Project',
    icon: 'FolderKanban',
    titleField: 'title',
    hasVisibility: true,
    hasOrder: true,
    hasFeatured: true,
    fields: [
      { key: 'title', label: 'Title', type: 'text', required: true },
      { key: 'slug', label: 'Slug', type: 'text', required: true, help: 'Lowercase letters, numbers and hyphens.' },
      { key: 'summary', label: 'Short summary', type: 'textarea', required: true },
      { key: 'description', label: 'Full description', type: 'textarea', required: true },
      { key: 'category', label: 'Category', type: 'text', required: true },
      { key: 'status', label: 'Status label', type: 'text', placeholder: 'Active prototype' },
      { key: 'coverImage', label: 'Cover image', type: 'media', help: 'Optional — line art is used when no image is uploaded.' },
      { key: 'gallery', label: 'Gallery images', type: 'media-list' },
      { key: 'technologies', label: 'Technology tags', type: 'tags', required: true },
      { key: 'githubUrl', label: 'GitHub URL', type: 'url' },
      { key: 'liveUrl', label: 'Live URL', type: 'url' },
      { key: 'featured', label: 'Featured project', type: 'boolean' },
      { key: 'visibility', label: 'Visibility', type: 'select', options: visibilityOptions },
      { key: 'order', label: 'Display order', type: 'number' },
    ],
  },
  {
    key: 'experience',
    label: 'Experience',
    singular: 'Experience entry',
    icon: 'Briefcase',
    titleField: 'role',
    hasVisibility: true,
    hasOrder: true,
    hasFeatured: false,
    fields: [
      { key: 'role', label: 'Role', type: 'text', required: true },
      { key: 'organization', label: 'Organisation', type: 'text', required: true },
      { key: 'location', label: 'Location', type: 'text' },
      { key: 'employmentType', label: 'Employment type', type: 'text', placeholder: 'Full-time, internship, research' },
      { key: 'startDate', label: 'Start date', type: 'date', required: true },
      { key: 'endDate', label: 'End date', type: 'date' },
      { key: 'isCurrent', label: 'Currently ongoing', type: 'boolean' },
      { key: 'description', label: 'Description', type: 'textarea', required: true },
      { key: 'highlights', label: 'Highlights', type: 'tags' },
      { key: 'tags', label: 'Skill tags', type: 'tags' },
      { key: 'logo', label: 'Organisation logo', type: 'media' },
      { key: 'certificate', label: 'Certificate / proof', type: 'media' },
      { key: 'visibility', label: 'Visibility', type: 'select', options: visibilityOptions },
      { key: 'order', label: 'Display order', type: 'number' },
    ],
  },
  {
    key: 'education',
    label: 'Education',
    singular: 'Education entry',
    icon: 'GraduationCap',
    titleField: 'degree',
    hasVisibility: true,
    hasOrder: true,
    hasFeatured: false,
    fields: [
      { key: 'degree', label: 'Degree / qualification', type: 'text', required: true },
      { key: 'institution', label: 'Institution', type: 'text', required: true },
      { key: 'location', label: 'Location', type: 'text' },
      { key: 'period', label: 'Period', type: 'text', required: true },
      { key: 'status', label: 'Status', type: 'text', required: true },
      { key: 'details', label: 'Details', type: 'textarea' },
      { key: 'coursework', label: 'Coursework', type: 'tags' },
      { key: 'achievementNote', label: 'Academic achievement', type: 'text' },
      { key: 'visibility', label: 'Visibility', type: 'select', options: visibilityOptions },
      { key: 'order', label: 'Display order', type: 'number' },
    ],
  },
  {
    key: 'skill_categories',
    label: 'Skill categories',
    singular: 'Skill category',
    icon: 'Layers',
    titleField: 'title',
    hasVisibility: true,
    hasOrder: true,
    hasFeatured: false,
    fields: [
      { key: 'title', label: 'Title', type: 'text', required: true },
      { key: 'description', label: 'Description', type: 'text' },
      { key: 'colourToken', label: 'Colour token', type: 'select', options: [
        { value: 'caramel', label: 'Caramel' },
        { value: 'bronze', label: 'Bronze' },
        { value: 'warm', label: 'Warm highlight' },
        { value: 'text', label: 'Neutral text' },
      ] },
      { key: 'visibility', label: 'Visibility', type: 'select', options: visibilityOptions },
      { key: 'order', label: 'Display order', type: 'number' },
    ],
  },
  {
    key: 'skills',
    label: 'Skills',
    singular: 'Skill',
    icon: 'Sparkles',
    titleField: 'name',
    hasVisibility: true,
    hasOrder: true,
    hasFeatured: true,
    fields: [
      { key: 'name', label: 'Skill name', type: 'text', required: true },
      { key: 'categoryId', label: 'Category ID', type: 'text', required: true, help: 'Paste the category ID from the Skill categories page.' },
      { key: 'note', label: 'Note (optional)', type: 'text' },
      { key: 'visibility', label: 'Visibility', type: 'select', options: visibilityOptions },
      { key: 'order', label: 'Display order', type: 'number' },
    ],
  },
  {
    key: 'achievements',
    label: 'Achievements & certificates',
    singular: 'Achievement',
    icon: 'Award',
    titleField: 'title',
    hasVisibility: true,
    hasOrder: true,
    hasFeatured: true,
    fields: [
      { key: 'type', label: 'Type', type: 'select', options: [
        { value: 'certificate', label: 'Certificate' },
        { value: 'achievement', label: 'Achievement' },
        { value: 'community', label: 'Community contribution' },
      ], required: true },
      { key: 'title', label: 'Title', type: 'text', required: true },
      { key: 'issuer', label: 'Issuing organisation', type: 'text' },
      { key: 'issueDate', label: 'Issue date', type: 'date' },
      { key: 'expiryDate', label: 'Expiry date (optional)', type: 'date', help: 'Only for certificates that actually expire.' },
      { key: 'credentialId', label: 'Credential ID', type: 'text' },
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'verificationUrl', label: 'Verification URL', type: 'url' },
      { key: 'file', label: 'Certificate file / image', type: 'media' },
      { key: 'featured', label: 'Featured', type: 'boolean' },
      { key: 'visibility', label: 'Visibility', type: 'select', options: visibilityOptions },
      { key: 'order', label: 'Display order', type: 'number' },
    ],
  },
  {
    key: 'social_links',
    label: 'Social links',
    singular: 'Social link',
    icon: 'Link2',
    titleField: 'label',
    hasVisibility: true,
    hasOrder: true,
    hasFeatured: false,
    fields: [
      { key: 'platform', label: 'Platform', type: 'text', required: true, placeholder: 'github' },
      { key: 'label', label: 'Label', type: 'text', required: true },
      { key: 'url', label: 'URL', type: 'url', required: true },
      { key: 'iconKey', label: 'Icon key', type: 'text' },
      { key: 'visible', label: 'Visible', type: 'boolean' },
      { key: 'visibility', label: 'Workflow state', type: 'select', options: visibilityOptions },
      { key: 'order', label: 'Display order', type: 'number' },
    ],
  },
];

export const collectionMap = Object.fromEntries(collections.map((c) => [c.key, c])) as Record<CollectionKey, CollectionConfig>;

export const aboutFields: FieldConfig[] = [
  { key: 'headline', label: 'Headline', type: 'text', required: true },
  { key: 'subheadline', label: 'Sub-headline', type: 'text', required: true },
  { key: 'bio', label: 'Biography', type: 'textarea', required: true },
  { key: 'intro', label: 'Short introduction', type: 'textarea' },
  { key: 'availability', label: 'Availability status', type: 'text' },
  { key: 'location', label: 'Location', type: 'text' },
  { key: 'careerDirection', label: 'Career direction', type: 'text' },
  { key: 'profileImage', label: 'Profile image', type: 'media' },
  { key: 'interests', label: 'Interests', type: 'tags' },
  { key: 'currentlyLearning', label: 'Currently learning', type: 'tags' },
];

export const settingsFields: FieldConfig[] = [
  { key: 'siteTitle', label: 'Site title', type: 'text', required: true },
  { key: 'siteDescription', label: 'Site description', type: 'textarea', required: true },
  { key: 'contactEmail', label: 'Contact email', type: 'text', required: true },
  { key: 'location', label: 'Location', type: 'text' },
  { key: 'timezone', label: 'Timezone', type: 'text' },
  { key: 'footerNote', label: 'Footer note', type: 'text' },
  { key: 'ogImage', label: 'Social sharing image', type: 'media' },
];
