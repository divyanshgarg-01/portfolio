#!/usr/bin/env node
/* eslint-disable no-console */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const WORKTREE = path.resolve(__dirname, '..');
const CONTENT_DIR = path.join(WORKTREE, 'src', 'content');
const DEFAULT_MASTER_APP = 'C:\\Users\\divya\\OneDrive\\Desktop\\Divyansh_Garg_Portfolio\\Divyansh Garg GitHub website';

const dbPath = process.env.MASTER_DB
  ? path.resolve(process.env.MASTER_DB)
  : path.join(DEFAULT_MASTER_APP, 'data', 'portfolio.db');
const masterApp = process.env.MASTER_APP
  ? path.resolve(process.env.MASTER_APP)
  : path.dirname(path.dirname(dbPath));

const COLLECTIONS = [
  { db: 'projects', folder: 'projects' },
  { db: 'experience', folder: 'experience' },
  { db: 'education', folder: 'education' },
  { db: 'skill_categories', folder: 'skill-categories' },
  { db: 'skills', folder: 'skills' },
  { db: 'achievements', folder: 'achievements' },
  { db: 'social_links', folder: 'socials' },
];

const SECTION_ORDER = [
  'top',
  'marquee',
  'about',
  'education',
  'experience',
  'approach',
  'projects',
  'certifications',
  'skills',
  'achievements',
  'community',
  'contact',
];

// Transcribed from the master public components so the static Vite app can
// render the same copy without importing any Next.js/server code.
// Sources: components/public/PublicSite.tsx, ProjectArchive.tsx, SkillMap.tsx,
// HowIBuild.tsx, Telemetry.tsx and components/motion/Terminal.tsx.
const LABELS = {
  common: {
    skipToContent: 'Skip to content',
    navLogoAria: 'Divyansh Garg, back to top',
    primaryNavigation: 'Primary navigation',
    openMenu: 'Open menu',
    monogram: 'DG',
    name: 'Divyansh Garg',
    decorativeSpark: '✦',
    cursorGo: 'Go',
    cursorView: 'View',
    cursorOpen: 'Open',
    cursorRead: 'Read',
    cursorExpand: 'Expand',
    cursorCopy: 'Copy',
    cursorVisit: 'Visit',
    cursorConnect: 'Connect',
    cursorDownload: 'Download',
    cursorVerify: 'Verify',
    cursorCode: 'Code',
    cursorProfile: 'Profile',
    cursorGitHub: 'GitHub',
    allWorkOnGitHub: 'All work on GitHub',
    close: 'Close',
  },
  hero: {
    kicker: 'PORTFOLIO / 2026',
    index: 'INDEX / 01—10',
    currentlyLabel: 'CURRENTLY —',
    currentlyScreenReaderPrefix: 'Currently: ',
    headlineFallback: 'DIVYANSH GARG',
    primaryButton: 'View Projects',
    secondaryButton: 'View CV',
    scrollCue: 'Scroll to explore',
  },
  about: {
    kicker: '(01) — About',
    heading: 'Building at the intersection of data and decisions.',
    editorialPhrase: 'data and decisions',
    introEditorialPhrase: 'intersection',
    marqueeAriaLabel: 'Areas of focus',
    portraitAltFallback: 'Portrait of Divyansh Garg',
    portraitPlaceholderAria: 'Profile image placeholder',
    portraitMonogram: 'DG',
    portraitCaptionSuffix: ' — portrait',
    portraitCaptionFallback: 'Profile image — awaiting approved portrait',
    draftBioNote: 'Review draft biography',
    statProjects: 'Projects',
    statExperiences: 'Experiences',
    statSkills: 'Skills',
    statAchievements: 'Achievements',
    statSuffix: '+',
    interestsTitle: 'INTERESTS',
  },
  education: {
    kicker: '(02) — Education',
    heading: 'Learning in public, building with intent.',
    verifyDetails: 'Verify details',
  },
  experience: {
    kicker: '(03) — Experience',
    heading: 'Roles that shaped how I work.',
    present: ' — Present',
  },
  approach: {
    kicker: '(04) — How I build',
    heading: 'Four ways of approaching the work.',
    editorialPhrase: 'the work',
    tablistLabel: 'How I approach the work',
    note: 'Drawn from the profile and work recorded in this portfolio.',
    panels: [
      { id: 'frame', number: '01', title: 'Frame the question', source: 'FROM THE PROFILE' },
      { id: 'evidence', number: '02', title: 'Follow the evidence', source: 'FROM THE RESEARCH' },
      { id: 'build', number: '03', title: 'Build in the open', source: 'FROM THE WORK' },
      { id: 'explore', number: '04', title: 'Keep exploring', source: 'CURRENTLY LEARNING' },
    ],
    evidencePrefix: 'Research focus: ',
    evidenceSuffix: '.',
    featuredSourcePrefix: 'FROM ',
  },
  projects: {
    kicker: '(05) — Selected work',
    heading: 'Projects with a point of view.',
    editorialPhrase: 'point of view',
    selectProject: 'Select a project',
    casePrefix: 'CASE / 0',
    featured: 'FEATURED',
    overview: 'OVERVIEW',
    technologies: 'TECHNOLOGIES',
    verifyDescription: 'Verify description',
    liveProject: 'Live project',
    source: 'Source',
    filterByCategory: 'Filter projects by category',
    filterAll: 'All work',
    searchProjects: 'Search projects',
    shownSuffix: 'SHOWN',
    projectPrefix: 'PROJECT / 0',
    featuredSeparator: ' · FEATURED',
    statusSeparator: ' · ',
    live: 'Live',
    code: 'Code',
  },
  certifications: {
    kicker: '(06) — Certifications',
    heading: 'Credentials earned so far.',
    railAria: 'Certifications — scroll horizontally to browse',
    pdfDocument: 'PDF certificate',
    genericDocument: 'Certificate record',
    issueDateMissing: 'Issue date not recorded',
    expiresPrefix: 'Expires ',
    issuerMissing: 'Issuing organisation not recorded',
    credentialId: 'Credential ID',
    notProvided: 'Not provided',
    viewCertificate: 'View Certificate',
    fileMissing: 'Certificate file not uploaded',
    verifyCredential: 'Verify Credential',
    lightboxAria: 'Certificate preview',
    lightboxTitle: 'Certificate',
  },
  skills: {
    kicker: '(07) — Capabilities',
    heading: 'What I bring to the table.',
    intro: 'A working map of what I am learning and applying — strongest across MERN, Python, data, business and applied AI, with plenty still in progress.',
    introEditorialPhrase: 'learning and applying',
    categoriesAria: 'Skill categories',
    otherTitle: 'Other skills',
    otherDescription: 'Published skills awaiting a category in the CMS.',
    skillsSuffix: ' / SKILLS',
    coreFocus: 'Core focus',
  },
  achievements: {
    kicker: '(08) — Achievements',
    heading: 'Proof of work, in progress.',
    editorialPhrase: 'in progress',
    railAria: 'Achievements and recognitions',
    verify: 'Verify',
    openPrefix: 'Open ',
    viewPrefix: 'View ',
  },
  community: {
    kicker: '(09) — Currently exploring',
    heading: 'Curiosity is a practice.',
    editorialPhrase: 'a practice',
    notice: 'Community statistics and video tabs are omitted until verified metrics and links are supplied.',
    learningLabel: 'CURRENTLY LEARNING',
  },
  contact: {
    kicker: '(10) — Contact',
    heading: "Let's build something worthwhile.",
    availabilityFallback: 'Open to thoughtful conversations about data, products and technology.',
    emailLabel: 'EMAIL',
    copy: 'Copy',
    locationLabel: 'LOCATION',
    localTimeLabel: 'LOCAL TIME',
    floatingCtaFallback: "Let's talk",
  },
  footer: {
    kicker: 'Stay in the loop',
    editorialPhrase: 'bronze light',
    copyrightPrefix: '©',
    backToTop: 'Back to top',
    signature: 'Coffee black, bronze light',
  },
  telemetry: {
    clockFallback: '--:--',
  },
  preloader: {
    words: ['Research', 'Building', 'Refining', 'Shipping'],
    signature: 'DIVYANSH GARG — PORTFOLIO',
    countFallback: '000',
  },
  terminal: {
    button: 'Open terminal',
    shortcut: '`',
    dialogLabel: 'Portfolio terminal',
    barUser: 'visitor@divyansh:~',
    escapeHint: 'ESC to close',
    initialLine: 'Interactive portfolio terminal. Type help to see available commands.',
    promptPrefix: 'visitor@divyansh:~$ ',
    helpHeading: 'available commands:',
    commandList: 'help · about · projects · skills · experience · education · achievements · contact · socials · clear · exit',
    noProjects: 'No published projects yet.',
    noSkills: 'No skills published yet.',
    noExperience: 'No experience published yet.',
    noEducation: 'No education published yet.',
    achievementsAnswer: 'Certificates are listed in the Certifications section; other achievements are in Achievements.',
    emailPrefix: 'Email: ',
    contactHint: 'Use the copy-email button or reach out on a linked social platform.',
    noSocials: 'No social links published yet.',
    mentorAnswer: 'Mentorship is not enabled in this portfolio.',
    hireAnswer: 'Permission denied — but collaboration is welcome. Use the contact command.',
    commandNotFoundPrefix: 'command not found: ',
    commandNotFoundSuffix: '. Type help.',
    inputLabel: 'Terminal command',
    placeholder: 'type help',
    reducedMotionPlaceholder: 'type a command',
    promptGlyph: '❯',
    submitGlyph: '↵',
    commands: ['help', 'about', 'projects', 'skills', 'experience', 'education', 'achievements', 'contact', 'socials', 'clear', 'exit'],
  },
};

function parseRowData(row) {
  return JSON.parse(row.data);
}

function compareText(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeText(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, 'utf8');
}

function cleanFolder(folder, keep) {
  const dir = path.join(CONTENT_DIR, folder);
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const file = path.join(dir, entry.name);
    if (!keep.has(path.resolve(file))) fs.unlinkSync(file);
  }
}

function readCurrentlyLines(appDir) {
  const sourcePath = path.join(appDir, 'lib', 'identity-roles.ts');
  const source = fs.readFileSync(sourcePath, 'utf8');
  return ['CURRENTLY_EDUCATION', 'CURRENTLY_INTERNSHIP', 'CURRENTLY_FOUNDER'].map((name) => {
    const match = source.match(new RegExp(`export const ${name}\\s*=\\s*'([^']*)'`));
    if (!match) throw new Error(`Could not read ${name} from ${sourcePath}`);
    return match[1];
  });
}

function deriveApproach(about, experience, projects) {
  const firstParagraph = String(about.bio || '').split('\n\n')[0];
  const research = experience.find((item) => /vled|research/i.test(`${item.organization} ${item.role}`)) || experience[0];
  const featured = projects.find((item) => item.featured) || projects[0];
  const evidenceBody = research && Array.isArray(research.highlights) && research.highlights.length
    ? `Research focus: ${research.highlights.join(', ')}.`
    : firstParagraph;

  return [
    {
      id: 'frame',
      title: 'Frame the question',
      source: 'FROM THE PROFILE',
      body: about.intro || firstParagraph,
    },
    {
      id: 'evidence',
      title: 'Follow the evidence',
      source: research
        ? `${String(research.role).toUpperCase()} · ${String(research.organization).toUpperCase()}`
        : 'FROM THE RESEARCH',
      body: evidenceBody,
    },
    {
      id: 'build',
      title: 'Build in the open',
      source: featured ? `FROM ${String(featured.title).toUpperCase()}` : 'FROM THE WORK',
      body: (featured && featured.summary) || firstParagraph,
    },
    {
      id: 'explore',
      title: 'Keep exploring',
      source: 'CURRENTLY LEARNING',
      body: firstParagraph,
    },
  ];
}

function mediaMetadata(asset) {
  return {
    altText: asset ? String(asset.altText || '') : '',
    mimeType: asset ? String(asset.mimeType || '') : '',
    size: asset ? Number(asset.size) || 0 : 0,
    width: asset ? Number(asset.width) || 0 : 0,
    height: asset ? Number(asset.height) || 0 : 0,
    bucket: asset ? String(asset.bucket || 'media-public') : 'media-public',
    filename: asset ? String(asset.filename || '') : '',
    folder: asset ? String(asset.folder || '') : '',
    uploadedBy: asset ? String(asset.uploadedBy || '') : '',
    blurDataUrl: asset ? String(asset.blurDataUrl || '') : '',
    createdAt: asset ? String(asset.createdAt || '') : '',
  };
}

function withAssetMetadata(target, prefix, asset) {
  const meta = mediaMetadata(asset);
  target[`${prefix}Alt`] = meta.altText;
  target[`${prefix}MimeType`] = meta.mimeType;
  target[`${prefix}Size`] = meta.size;
  target[`${prefix}Width`] = meta.width;
  target[`${prefix}Height`] = meta.height;
  target[`${prefix}Bucket`] = meta.bucket;
  target[`${prefix}Filename`] = meta.filename;
  target[`${prefix}Folder`] = meta.folder;
  target[`${prefix}UploadedBy`] = meta.uploadedBy;
  target[`${prefix}BlurDataUrl`] = meta.blurDataUrl;
  target[`${prefix}CreatedAt`] = meta.createdAt;
  return target;
}

function README() {
  return `# Decap-editable content snapshot

These JSON files are the published-content snapshot of the master Next.js portfolio.
Decap CMS edits **these files** on \`gh-pages-baseline\`; the Vite app reads them through
\`src/data/portfolio.ts\`. Do not hand-edit generated files unless you are also updating Decap's schema.

Regenerate with:

\`\`\`bash
node scripts/export-snapshot.cjs
\`\`\`

The script opens the master SQLite database read-only (\`MASTER_DB\` overrides the default path)
and only exports rows where \`deleted_at IS NULL\` and \`visibility = 'published'\`. Social links
must also have \`visible === true\`. Stale JSON files in the collection folders are removed on
re-run; files in other folders are untouched.

## Singletons

- \`settings.json\` — the master \`settings\` singleton, plus \`currentlyLines\`, \`labels\`,
  \`sectionOrder\`, \`approach\` and \`community\`. The \`labels.preloader\` group mirrors
  the loader words and signature. All original keys are preserved.
- \`about.json\` — the master \`about\` singleton. \`profileImage\` is the media path and is
  accompanied by \`profileImageAlt\`, \`profileImageWidth\` and \`profileImageHeight\` (plus
  matching \`profileImage*\` media metadata used by the static adapter).
- \`resume.json\` — \`{ title, fileUrl, lastUpdated, summary }\`.

## Folder collections

Each published entity is a single file named \`<id>.json\` in its folder:

| Folder | Collection | Extra exported fields |
| --- | --- | --- |
| \`projects/\` | projects | \`coverImage\` (path or \`""\`), \`coverAlt\`, \`coverWidth\`, \`coverHeight\` and \`cover*\` media metadata |
| \`experience/\` | experience | original fields only |
| \`education/\` | education | original fields only |
| \`skill-categories/\` | skill_categories | original fields only |
| \`skills/\` | skills | original fields only |
| \`achievements/\` | achievements | \`file\` (media path), \`fileUrl\` (the exact media path), \`fileType\` (media MIME type) and \`file*\` media metadata |
| \`socials/\` | social_links | original fields only; published + visible links only |

All entity files keep \`id\`, \`order\`, \`visibility\`, \`featured\`, timestamps and other original
fields. \`visibility\` and \`order\` are used by \`src/data/portfolio.ts\` to filter and sort.

## Media handling

JSON files store **paths** (for example \`/uploads/profile/divyansh-portrait-reveal.webp\`) so
Decap's media widget can resolve them. The Vite adapter converts paths to media IDs
(\`media_profile\`, \`cover_<project-id>\`, \`achievement_<achievement-id>\`) and builds a
\`MediaAsset[]\` from the exported \`*\` metadata fields. Achievement \`fileUrl\` values are the
exact paths from the master media records; no certificate URL rewriting is performed.
`;
}

function main() {
  fs.mkdirSync(CONTENT_DIR, { recursive: true });

  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const singletonRows = db.prepare('SELECT key, data FROM singletons').all();
    const singletonMap = new Map(singletonRows.map((row) => [String(row.key), parseRowData(row)]));
    const settingsRaw = singletonMap.get('settings');
    const aboutRaw = singletonMap.get('about');
    if (!settingsRaw || !aboutRaw) throw new Error('Master database is missing settings/about singletons');

    const mediaRows = db.prepare('SELECT id, data FROM media').all();
    const mediaById = new Map();
    const mediaByPath = new Map();
    for (const row of mediaRows) {
      const asset = parseRowData(row);
      const id = String(asset.id || row.id);
      mediaById.set(id, asset);
      if (asset.path) mediaByPath.set(String(asset.path), asset);
    }

    const resolveMedia = (value) => {
      if (typeof value !== 'string' || !value) return null;
      return mediaById.get(value) || mediaByPath.get(value) || null;
    };
    const toMediaPath = (value) => {
      const asset = resolveMedia(value);
      if (asset && asset.path) return String(asset.path);
      return typeof value === 'string' && value.startsWith('/') ? value : '';
    };

    const entities = {};
    const keepSets = {};
    for (const { db: collection, folder } of COLLECTIONS) {
      const rows = db.prepare(
        "SELECT id, data, order_index, visibility, featured, created_at, updated_at, published_at " +
        "FROM entities WHERE collection = ? AND deleted_at IS NULL AND visibility = 'published' " +
        'ORDER BY order_index ASC, id ASC',
      ).all(collection);

      const files = new Set();
      const items = [];
      for (const row of rows) {
        const data = parseRowData(row);
        const entity = { ...data };
        entity.id = String(row.id);
        entity.order = Number(row.order_index);
        entity.visibility = String(row.visibility);
        entity.featured = Boolean(row.featured);
        if (entity.createdAt === undefined) entity.createdAt = String(row.created_at || '');
        if (entity.updatedAt === undefined) entity.updatedAt = String(row.updated_at || '');
        if (entity.publishedAt === undefined) entity.publishedAt = row.published_at === null ? null : String(row.published_at);
        if (entity.deletedAt === undefined) entity.deletedAt = null;

        if (collection === 'social_links' && entity.visible !== true) continue;
        if (collection === 'projects') {
          const asset = resolveMedia(entity.coverImage);
          entity.coverImage = toMediaPath(entity.coverImage);
          withAssetMetadata(entity, 'cover', asset);
        }
        if (collection === 'achievements') {
          const asset = resolveMedia(entity.file);
          const filePath = toMediaPath(entity.file);
          entity.file = filePath;
          entity.fileUrl = filePath;
          entity.fileType = asset
            ? String(asset.mimeType || '')
            : (filePath.endsWith('.pdf') ? 'application/pdf' : filePath ? 'image/webp' : '');
          withAssetMetadata(entity, 'file', asset);
        }

        items.push(entity);
        const file = path.resolve(path.join(CONTENT_DIR, folder, `${entity.id}.json`));
        writeJson(file, entity);
        files.add(file);
      }
      entities[collection] = items;
      keepSets[folder] = files;
      cleanFolder(folder, files);
    }

    const profileAsset = resolveMedia(aboutRaw.profileImage);
    const about = { ...aboutRaw };
    about.profileImage = toMediaPath(aboutRaw.profileImage);
    withAssetMetadata(about, 'profileImage', profileAsset);

    const settings = {
      ...settingsRaw,
      currentlyLines: readCurrentlyLines(masterApp),
      labels: LABELS,
      sectionOrder: SECTION_ORDER,
      approach: deriveApproach(aboutRaw, entities.experience, entities.projects),
      community: {
        heading: 'Curiosity is a practice.',
        kicker: '(09) — Currently exploring',
        notice: 'Community statistics and video tabs are omitted until verified metrics and links are supplied.',
        learningLabel: 'CURRENTLY LEARNING',
      },
    };

    const resume = {
      title: 'CV',
      fileUrl: '/uploads/resume/Divyansh_Garg_CV.pdf',
      lastUpdated: '',
      summary: '',
    };

    writeJson(path.join(CONTENT_DIR, 'settings.json'), settings);
    writeJson(path.join(CONTENT_DIR, 'about.json'), about);
    writeJson(path.join(CONTENT_DIR, 'resume.json'), resume);
    writeText(path.join(CONTENT_DIR, 'README.md'), README());

    const counts = COLLECTIONS.map(({ folder }) => `${folder}=${entities[COLLECTIONS.find((c) => c.folder === folder).db].length}`).join(' ');
    console.log(`Wrote content snapshot from ${dbPath}`);
    console.log(`Singletons: settings, about, resume; collections: ${counts}`);
  } finally {
    db.close();
  }
}

main();
