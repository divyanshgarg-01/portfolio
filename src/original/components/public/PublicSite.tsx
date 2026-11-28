import { useEffect, useRef, type ReactNode } from 'react';
import {
  ArrowUp,
  ArrowUpRight,
  Award,
  Clock3,
  Copy,
  FileText,
  Github,
  Linkedin,
  Mail,
  MapPin,
  Menu,
  Plus,
  X,
} from 'lucide-react';
import { AppearanceSync } from '@/components/motion/AppearanceSync';
import { MicroCosmos } from '@/components/motion/MicroCosmos';
import { Preloader } from '@/components/motion/Preloader';
import { PublicMotion } from '@/components/motion/PublicMotion';
import { Terminal, type TerminalData } from '@/components/motion/Terminal';
import { HowIBuild } from '@/components/public/HowIBuild';
import { PortraitReveal } from '@/components/public/PortraitReveal';
import { ProjectArchive, type ProjectCover } from '@/components/public/ProjectArchive';
import { SkillMap } from '@/components/public/SkillMap';
import { LocalClock, ScrollProgress } from '@/components/public/Telemetry';
import { CV_URL } from '@/lib/cv';
import { deriveCurrentlyLines } from '@/lib/identity-roles';
import { label, type LabelMap } from '@/lib/labels';
import type { MediaAsset, PortfolioData } from '@/lib/types';
import { staticFileUrls } from '../../../data/portfolio';

type SectionHeadingKey = 'about' | 'education' | 'experience' | 'approach' | 'projects' | 'certifications' | 'skills' | 'achievements' | 'community' | 'contact';
type SectionHeadingValue = string | { heading?: string; title?: string; kicker?: string; label?: string };
type SectionHeadings = Partial<Record<SectionHeadingKey, SectionHeadingValue>>;

const defaultSectionHeadings: Record<SectionHeadingKey, string> = {
  about: 'Building at the intersection of data and decisions.',
  education: 'Learning in public, building with intent.',
  experience: 'Roles that shaped how I work.',
  approach: 'Four ways of approaching the work.',
  projects: 'Projects with a point of view.',
  certifications: 'Credentials earned so far.',
  skills: 'What I bring to the table.',
  achievements: 'Proof of work, in progress.',
  community: 'Curiosity is a practice.',
  contact: "Let's build something worthwhile.",
};

function readSectionHeading(settings: PortfolioData['settings'], key: SectionHeadingKey): SectionHeadingValue | undefined {
  // sectionHeadings is a newer CMS field; tolerate older settings records.
  return (settings as unknown as { sectionHeadings?: SectionHeadings }).sectionHeadings?.[key];
}

function sectionHeading(settings: PortfolioData['settings'], key: SectionHeadingKey, labels?: LabelMap): string {
  const value = readSectionHeading(settings, key);
  const text = typeof value === 'string' ? value : value && typeof value === 'object' ? value.heading || value.title || '' : '';
  if (text.trim()) return text.trim();
  if (key === 'community' && settings.community?.heading?.trim()) return settings.community.heading.trim();
  return label(labels, `${key}.heading`, defaultSectionHeadings[key]);
}

function sectionKicker(settings: PortfolioData['settings'], key: SectionHeadingKey, fallback: string, labels?: LabelMap): string {
  const value = readSectionHeading(settings, key);
  const explicit = value && typeof value === 'object' ? value.kicker?.trim() || value.label?.trim() || '' : '';
  if (explicit) return explicit;
  if (key === 'community' && settings.community?.kicker?.trim()) return settings.community.kicker.trim();
  return label(labels, `${key}.kicker`, fallback);
}

// Only phrases already present in the CMS copy are italicised; no new prose is
// introduced for the sake of the editorial treatment.
const editorialPhrases: Partial<Record<SectionHeadingKey, string>> = {
  about: 'data and decisions',
  approach: 'the work',
  projects: 'point of view',
  achievements: 'in progress',
  community: 'a practice',
};

function editorialText(text: string, phrase?: string): ReactNode {
  if (!phrase) return text;
  const index = text.toLowerCase().indexOf(phrase.toLowerCase());
  if (index < 0) return text;
  return (
    <>
      {text.slice(0, index)}
      <em className="editorial">{text.slice(index, index + phrase.length)}</em>
      {text.slice(index + phrase.length)}
    </>
  );
}

function contactHeadingLines(text: string): [string, string, string] {
  const explicit = text.split('\n').map((line) => line.trim()).filter(Boolean);
  if (explicit.length >= 3) return [explicit[0], explicit[1], explicit.slice(2).join(' ')];
  if (explicit.length === 2) return [explicit[0], '', explicit[1]];
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 3) return ['', '', text];
  const firstCount = Math.ceil(words.length / 3);
  const secondCount = Math.ceil((words.length - firstCount) / 2);
  return [words.slice(0, firstCount).join(' '), words.slice(firstCount, firstCount + secondCount).join(' '), words.slice(firstCount + secondCount).join(' ')];
}

const STATIC_BASE = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');

function withBase(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  if (STATIC_BASE && (path === STATIC_BASE || path.startsWith(`${STATIC_BASE}/`))) return path;
  return `${STATIC_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

function mediaSrc(asset: MediaAsset | undefined): string {
  if (!asset) return '';
  const path = asset.path?.trim() ?? '';
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  // Static GitHub Pages only hosts public files; private buckets have no route.
  if (asset.bucket !== 'media-public') return '';
  return withBase(path);
}

function positiveDimension(value: number): number | undefined {
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

export function PublicSite({ data }: { data: PortfolioData }) {
  const { settings, about, socials, projects, experience, education, skillCategories, skills, achievements } = data;
  const labels = settings.labels;
  const visible = settings.sectionVisibility;
  const mediaById = new Map(data.media.map((asset) => [asset.id, asset]));
  const resolve = (id: string): MediaAsset | undefined => mediaById.get(id);
  const profile = resolve(about.profileImage);
  const profileSrc = mediaSrc(profile);
  const projectCovers: Record<string, ProjectCover> = Object.fromEntries(projects.map((project) => {
    const asset = resolve(project.coverImage);
    return [project.id, {
      src: mediaSrc(asset),
      alt: asset?.altText || project.title,
      width: positiveDimension(asset?.width ?? 0),
      height: positiveDimension(asset?.height ?? 0),
    }];
  }));
  const githubUrl = socials.find((social) => social.platform.includes('github'))?.url || '#';
  const heading = (key: SectionHeadingKey) => sectionHeading(settings, key, labels);
  const editorialHeading = (key: SectionHeadingKey) => {
    const phrase = editorialPhrases[key];
    return editorialText(heading(key), phrase ? label(labels, `${key}.editorialPhrase`, phrase) : undefined);
  };
  const kicker = (key: SectionHeadingKey, fallback: string) => sectionKicker(settings, key, fallback, labels);
  const contactLines = contactHeadingLines(heading('contact'));
  const email = settings.contactEmail;
  const bioIsDraft = /draft placeholder|confirm /i.test(about.bio);
  const currentlyLines = settings.currentlyLines ?? deriveCurrentlyLines();
  // Certifications are their own section; achievement cards never repeat them.
  const certificates = achievements.filter((item) => item.type === 'certificate');
  const nonCertificateAchievements = achievements.filter((item) => item.type !== 'certificate');
  const credentialLabel = (value: string | undefined): string => (value && !/confirm|placeholder|draft/i.test(value) ? value.trim() : '');
  const safeHttpUrl = (value: string | undefined): string => (value && /^https?:\/\//i.test(value.trim()) ? value.trim() : '');
  const certificateFileUrl = (id: string): string => withBase(staticFileUrls[id] || `/uploads/achievements/${encodeURIComponent(id)}`);
  const achievementFileUrl = (id: string): string => withBase(staticFileUrls[id] || `/uploads/achievements/${encodeURIComponent(id)}`);
  const terminalData: TerminalData = {
    name: settings.siteTitle.split('—')[0].trim() || label(labels, 'common.name', 'Divyansh Garg'),
    role: about.careerDirection || about.subheadline,
    location: about.location || settings.location,
    about: about.bio.replace(/\s+/g, ' ').slice(0, 360),
    email,
    projects: projects.map((project) => ({ title: project.title, status: project.status, url: project.liveUrl || project.githubUrl })),
    skills: skills.map((skill) => skill.name),
    experience: experience.map((item) => ({ role: item.role, organization: item.organization })),
    education: education.map((item) => `${item.degree} — ${item.institution} (${item.period})`),
    socials: socials.map((social) => ({ label: social.label, url: social.url })),
    labels,
  };

  const socialIcon = (platform: string) => {
    if (platform.includes('github')) return <Github size={16} aria-hidden="true" />;
    if (platform.includes('linkedin')) return <Linkedin size={16} aria-hidden="true" />;
    return <Mail size={16} aria-hidden="true" />;
  };

  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const order = settings.sectionOrder;
    if (!Array.isArray(order) || order.length === 0) return;
    const main = mainRef.current;
    if (!main) return;
    const sections = Array.from(main.children).filter(
      (child): child is HTMLElement => child instanceof HTMLElement && child.tagName === 'SECTION',
    );
    const sectionFor = (id: string): HTMLElement | undefined => {
      if (id === 'hero') return sections.find((section) => section.id === 'top');
      if (id === 'marquee') return sections.find((section) => section.hasAttribute('data-marquee-wrap'));
      return sections.find((section) => section.id === id);
    };
    const placed = new Set<HTMLElement>();
    const ordered: HTMLElement[] = [];
    order.forEach((id) => {
      const section = sectionFor(id);
      if (section && !placed.has(section)) {
        ordered.push(section);
        placed.add(section);
      }
    });
    sections.forEach((section) => {
      if (!placed.has(section)) ordered.push(section);
    });
    if (ordered.every((section, index) => sections[index] === section)) return;
    ordered.forEach((section) => main.appendChild(section));
  }, [settings.sectionOrder]);

  return (
    <>
      <AppearanceSync appearance={settings.appearance} />
      <ScrollProgress />
      <MicroCosmos density={settings.appearance.emberDensity} />
      <Preloader enabled={settings.appearance.loader} labels={labels} />
      <PublicMotion />
      <div className="cursor-dot" data-cursor-dot aria-hidden="true" />
      <div className="cursor-ring" data-cursor-ring aria-hidden="true" />
      <a className="skip-link" href="#main">{label(labels, 'common.skipToContent', 'Skip to content')}</a>

      <header className="site-nav" data-nav>
        <div className="container site-nav__inner">
          <a className="nav-logo" href="#top" aria-label={label(labels, 'common.navLogoAria', 'Divyansh Garg, back to top')}>{label(labels, 'common.monogram', 'DG')}<span>.</span></a>
          <nav className="nav-links" aria-label={label(labels, 'common.primaryNavigation', 'Primary navigation')}>
            {settings.navItems.filter((item) => item.visible).map((item) => (
              <a key={item.section} href={`#${item.section}`} data-nav-link data-roll data-cursor={label(labels, 'common.cursorGo', 'Go')}>{item.label}</a>
            ))}
          </nav>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="menu-btn" type="button" data-menu-btn aria-expanded="false" aria-label={label(labels, 'common.openMenu', 'Open menu')} aria-controls="mobile-menu"><Menu size={22} /></button>
          </div>
        </div>
      </header>

      <div className="menu-panel" id="mobile-menu" data-menu-panel>
        {settings.navItems.filter((item) => item.visible).map((item, index) => (
          <a key={item.section} href={`#${item.section}`}><span>0{index + 1}</span><span data-roll>{item.label}</span></a>
        ))}
      </div>

      <main id="main" tabIndex={-1} ref={mainRef}>
        {visible.hero !== false && (
          <section className="hero" id="top" data-hero-section data-cta-blocker>
            <div className="hero__glow" aria-hidden="true" />
            <canvas className="hero-name-canvas" data-hero-name-canvas aria-hidden="true" />
            <div className="container hero__inner">
              <div className="hero__top" data-hero>
                <div className="kicker" data-scramble>{label(labels, 'hero.kicker', 'PORTFOLIO / 2026')}</div>
                <div className="hero__meta"><span>{label(labels, 'hero.index', 'INDEX / 01—10')}</span><span>{about.location || settings.location}</span><span>{settings.timezone}</span></div>
              </div>
              <h1 className="hero__title" data-chars data-cosmos-name={about.headline || label(labels, 'hero.headlineFallback', 'DIVYANSH GARG')}>{about.headline || label(labels, 'hero.headlineFallback', 'DIVYANSH GARG')}</h1>
              <div className="hero__underline" data-hero-underline aria-hidden="true" />
              <div className="hero__sub" data-hero>
                <span className="lede" data-hero-lede>{about.subheadline}</span>
                <div className="hero__currently" data-currently>
                  <span className="hero__currently-label" data-currently-label>{label(labels, 'hero.currentlyLabel', 'CURRENTLY —')}</span>
                  <span className="hero__currently-lines" data-currently-viewport>
                    {currentlyLines.map((line) => (
                      <span className="hero__currently-line" data-currently-line key={line} aria-hidden="true">
                        <span data-currently-text>{line}</span>
                      </span>
                    ))}
                  </span>
                  <span className="sr-only">{label(labels, 'hero.currentlyScreenReaderPrefix', 'Currently: ')}{currentlyLines.join('; ')}</span>
                </div>
              </div>
              <div className="hero__foot" data-hero>
                <div className="hero__actions">
                  <a className="btn btn--primary" href="#projects" data-magnetic="0.25" data-cursor={label(labels, 'common.cursorView', 'View')}>{label(labels, 'hero.primaryButton', 'View Projects')} <ArrowUpRight className="arrow" size={16} /></a>
                  <a className="btn btn--cv" href={CV_URL} target="_blank" rel="noopener noreferrer" data-magnetic="0.2" data-cursor={label(labels, 'common.cursorOpen', 'Open')}>{label(labels, 'hero.secondaryButton', 'View CV')} <ArrowUpRight className="arrow" size={16} /></a>
                </div>
                <div>
                  <div className="scroll-cue"><i />{label(labels, 'hero.scrollCue', 'Scroll to explore')}</div>
                  <div className="hero__coordinates" style={{ marginTop: 16 }}>{about.location || settings.location}<br />{settings.timezone}</div>
                </div>
              </div>
            </div>
          </section>
        )}

        {visible.hero !== false && about.interests.length > 0 && (
          <section className="marquee" aria-label={label(labels, 'about.marqueeAriaLabel', 'Areas of focus')} data-marquee-wrap>
            <div className="marquee__track" data-marquee>
              {[0, 1].map((copy) => (
                <span key={copy} aria-hidden={copy === 1}>
                  {about.interests.map((interest) => <span key={interest}>{interest}<i aria-hidden="true">{label(labels, 'common.decorativeSpark', '✦')}</i></span>)}
                </span>
              ))}
            </div>
          </section>
        )}

        {visible.about !== false && (
          <section className="section" id="about" data-cta-blocker>
            <div className="container about-grid">
              <div data-reveal>
                <div
                  className="portrait"
                  data-portrait
                  data-cursor={label(labels, 'common.cursorProfile', 'Profile')}
                  style={profile?.width && profile?.height ? { aspectRatio: `${profile.width} / ${profile.height}` } : undefined}
                >
                  <div data-portrait-inner style={{ width: '100%', height: '100%' }}>
                    {profileSrc ? (
                      <PortraitReveal
                        src={profileSrc}
                        alt={profile?.altText || label(labels, 'about.portraitAltFallback', 'Portrait of Divyansh Garg')}
                        width={positiveDimension(profile?.width ?? 0)}
                        height={positiveDimension(profile?.height ?? 0)}
                      />
                    ) : (
                      <div className="portrait__monogram" aria-label={label(labels, 'about.portraitPlaceholderAria', 'Profile image placeholder')}>{label(labels, 'about.portraitMonogram', 'DG')}</div>
                    )}
                  </div>
                </div>
                <div className="portrait__caption">{profileSrc ? `${about.headline || label(labels, 'common.name', 'Divyansh Garg')}${label(labels, 'about.portraitCaptionSuffix', ' — portrait')}` : label(labels, 'about.portraitCaptionFallback', 'Profile image — awaiting approved portrait')}</div>
              </div>
              <div className="about__copy">
                <div className="kicker" data-scramble>{kicker('about', '(01) — About')}</div>
                <h2 className="h2" data-split>{editorialHeading('about')}</h2>
                <p className="lede" data-fill>{editorialText(about.intro, label(labels, 'about.introEditorialPhrase', 'intersection'))}</p>
                {bioIsDraft && <span className="placeholder-note">{label(labels, 'about.draftBioNote', 'Review draft biography')}</span>}
                {about.bio.split('\n\n').map((paragraph, index) => (
                  <p key={index} data-reveal>{paragraph}</p>
                ))}
                {about.availability && (
                  <div className="notice" data-reveal><MapPin size={15} style={{ display: 'inline', marginRight: 8 }} />{about.availability}</div>
                )}
                <div className="stat-grid">
                  <div className="stat"><strong data-count={projects.length} data-suffix={label(labels, 'about.statSuffix', '+')}>0</strong><span>{label(labels, 'about.statProjects', 'Projects')}</span></div>
                  <div className="stat"><strong data-count={experience.length} data-suffix={label(labels, 'about.statSuffix', '+')}>0</strong><span>{label(labels, 'about.statExperiences', 'Experiences')}</span></div>
                  <div className="stat"><strong data-count={skills.length} data-suffix={label(labels, 'about.statSuffix', '+')}>0</strong><span>{label(labels, 'about.statSkills', 'Skills')}</span></div>
                  <div className="stat"><strong data-count={achievements.length} data-suffix={label(labels, 'about.statSuffix', '+')}>0</strong><span>{label(labels, 'about.statAchievements', 'Achievements')}</span></div>
                </div>
                <p className="mono" style={{ marginTop: 34 }}>{label(labels, 'about.interestsTitle', 'INTERESTS')}</p>
                <div className="chip-row">{about.interests.map((item) => <span className="chip" key={item}>{item}</span>)}</div>
              </div>
            </div>
          </section>
        )}

        {visible.education !== false && education.length > 0 && (
          <section className="section" id="education">
            <div className="container">
              <div className="kicker" data-scramble>{kicker('education', '(02) — Education')}</div>
              <h2 className="h2" data-split>{editorialHeading('education')}</h2>
              <div className="rows rows--timeline">
                {education.map((item, index) => (
                  <article className="row" key={item.id} data-reveal data-cursor={label(labels, 'common.cursorRead', 'Read')}>
                    <div className="row__period"><span className="timeline__node" aria-hidden="true">0{index + 1}</span>{item.period}</div>
                    <div className="row__body">
                      <h3>{item.degree}{item.details?.toLowerCase().includes('confirm') && <span className="placeholder-note">{label(labels, 'education.verifyDetails', 'Verify details')}</span>}</h3>
                      <p>{item.institution}{item.location ? ` · ${item.location}` : ''}</p>
                      {item.details && <p style={{ marginTop: 8 }}>{item.details}</p>}
                      {item.coursework.length > 0 && <div className="chip-row">{item.coursework.map((course) => <span className="chip" key={course}>{course}</span>)}</div>}
                    </div>
                    <div className="row__meta">{item.status}</div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}

        {visible.experience !== false && experience.length > 0 && (
          <section className="section" id="experience">
            <div className="container">
              <div className="kicker" data-scramble>{kicker('experience', '(03) — Experience')}</div>
              <h2 className="h2" data-split>{editorialHeading('experience')}</h2>
              <div className="rows rows--timeline">
                {experience.map((item, index) => (
                  <article className="exp-row" key={item.id} data-reveal>
                    <button className="exp-row__button" type="button" data-accordion aria-expanded="false" data-cursor={label(labels, 'common.cursorExpand', 'Expand')}>
                      <span className="row__period"><span className="timeline__node" aria-hidden="true">0{index + 1}</span>{item.startDate}{item.endDate ? ` — ${item.endDate}` : item.isCurrent ? label(labels, 'experience.present', ' — Present') : ''}</span>
                      <span>
                        <strong style={{ display: 'block', fontSize: '1.18rem' }}>{item.role}</strong>
                        <span className="muted" style={{ fontSize: '0.92rem' }}>{item.organization}{item.location ? ` · ${item.location}` : ''}</span>
                      </span>
                      <span className="exp-row__icon"><Plus size={16} /></span>
                    </button>
                    <div className="exp-row__panel" aria-hidden="true" inert><div><div className="exp-row__content">
                      <p>{item.description}</p>
                      {item.highlights.length > 0 && (
                        <ul>{item.highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}</ul>
                      )}
                      {item.tags.length > 0 && <div className="chip-row">{item.tags.map((tag) => <span className="chip" key={tag}>{tag}</span>)}</div>}
                    </div></div></div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}

        {visible.approach !== false && (
          <section className="section" id="approach">
            <div className="container">
              <div className="kicker" data-scramble>{kicker('approach', '(04) — How I build')}</div>
              <h2 className="h2" data-split>{editorialHeading('approach')}</h2>
              <HowIBuild about={about} experience={experience} projects={projects} skills={skills} labels={labels} approach={settings.approach} />
            </div>
          </section>
        )}

        {visible.projects !== false && projects.length > 0 && (
          <section className="section" id="projects" data-cta-blocker>
            <div className="container projects-head">
              <div>
                <div className="kicker" data-scramble>{kicker('projects', '(05) — Selected work')}</div>
                <h2 className="h2" data-split>{editorialHeading('projects')}</h2>
              </div>
              <a className="link-arrow" href={githubUrl} data-cursor={label(labels, 'common.cursorGitHub', 'GitHub')}>{label(labels, 'common.allWorkOnGitHub', 'All work on GitHub')} <ArrowUpRight className="arrow" size={16} /></a>
            </div>
            <div className="container">
              <ProjectArchive projects={projects} covers={projectCovers} labels={labels} />
            </div>
          </section>
        )}

        {visible.certifications !== false && certificates.length > 0 && (
          <section className="section" id="certifications">
            <div className="container">
              <div className="kicker" data-scramble>{kicker('certifications', '(06) — Certifications')}</div>
              <h2 className="h2" data-split>{editorialHeading('certifications')}</h2>
              <div
                className="certificate-grid"
                data-certificate-rail
                data-drag-rail
                role="region"
                aria-label={label(labels, 'certifications.railAria', 'Certifications — scroll horizontally to browse')}
                tabIndex={0}
              >
                {certificates.map((item) => {
                  const file = resolve(item.file);
                  const fileUrl = certificateFileUrl(item.id);
                  const isPdf = file?.mimeType === 'application/pdf';
                  const isImage = Boolean(file && !isPdf);
                  const credential = credentialLabel(item.credentialId);
                  const expiry = credentialLabel(item.expiryDate);
                  const issuer = credentialLabel(item.issuer);
                  const description = credentialLabel(item.description);
                  const verifyUrl = safeHttpUrl(item.verificationUrl);
                  return (
                    <article className="certificate-card" key={item.id} data-reveal>
                      <div className="certificate-card__preview" aria-hidden={isImage ? undefined : true}>
                        <span className="certificate-card__seal"><Award size={18} /></span>
                        {isImage ? (
                          <img className="certificate-card__image" src={fileUrl} alt="" loading="lazy" />
                        ) : (
                          <span className="certificate-card__document">
                            <FileText size={34} strokeWidth={1.2} />
                            <span>{isPdf ? label(labels, 'certifications.pdfDocument', 'PDF certificate') : label(labels, 'certifications.genericDocument', 'Certificate record')}</span>
                          </span>
                        )}
                      </div>
                      <div className="certificate-card__body">
                        <div className="certificate-card__meta">
                          <span>{credentialLabel(item.issueDate) || label(labels, 'certifications.issueDateMissing', 'Issue date not recorded')}</span>
                          {expiry && <span>{`${label(labels, 'certifications.expiresPrefix', 'Expires ')}${expiry}`}</span>}
                        </div>
                        <h3 className="h3">{item.title}</h3>
                        <p className="certificate-card__issuer">{issuer || label(labels, 'certifications.issuerMissing', 'Issuing organisation not recorded')}</p>
                        <dl className="certificate-card__details">
                          <dt>{label(labels, 'certifications.credentialId', 'Credential ID')}</dt>
                          <dd>{credential || label(labels, 'certifications.notProvided', 'Not provided')}</dd>
                        </dl>
                        {description && <p className="certificate-card__description">{description}</p>}
                        <div className="certificate-card__actions">
                          {file ? (
                            <a className="link-arrow" href={fileUrl} target="_blank" rel="noopener noreferrer" data-cursor={label(labels, 'common.cursorView', 'View')}>
                              {label(labels, 'certifications.viewCertificate', 'View Certificate')} <ArrowUpRight className="arrow" size={14} />
                            </a>
                          ) : (
                            <span className="certificate-card__unavailable">{label(labels, 'certifications.fileMissing', 'Certificate file not uploaded')}</span>
                          )}
                          {verifyUrl && (
                            <a className="link-arrow" href={verifyUrl} target="_blank" rel="noopener noreferrer" data-cursor={label(labels, 'common.cursorVerify', 'Verify')}>
                              {label(labels, 'certifications.verifyCredential', 'Verify Credential')} <ArrowUpRight className="arrow" size={14} />
                            </a>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {visible.skills !== false && skills.length > 0 && (
          <section className="section" id="skills">
            <div className="container">
              <div className="kicker" data-scramble>{kicker('skills', '(07) — Capabilities')}</div>
              <h2 className="h2" data-split>{editorialHeading('skills')}</h2>
              <p className="section-intro" data-reveal>
                {editorialText(label(labels, 'skills.intro', 'A working map of what I am learning and applying — strongest across MERN, Python, data, business and applied AI, with plenty still in progress.'), label(labels, 'skills.introEditorialPhrase', 'learning and applying'))}
              </p>
              <div data-reveal>
                <SkillMap categories={skillCategories} skills={skills} labels={labels} />
              </div>
            </div>
          </section>
        )}

        {visible.achievements !== false && nonCertificateAchievements.length > 0 && (
          <section className="section" id="achievements">
            <div className="container">
              <div className="kicker" data-scramble>{kicker('achievements', '(08) — Achievements')}</div>
              <h2 className="h2" data-split>{editorialHeading('achievements')}</h2>
              <div className="rail" role="group" aria-label={label(labels, 'achievements.railAria', 'Achievements and recognitions')} data-drag-rail>
                {nonCertificateAchievements.map((item) => {
                  const file = resolve(item.file);
                  const isPdf = file?.mimeType === 'application/pdf';
                  const fileUrl = achievementFileUrl(item.id);
                  const content = (
                    <>
                      <span className="achievement-card__type">{item.type} · {item.issueDate}</span>
                      <span>
                        <strong className="h3" style={{ display: 'block' }}>{item.title}</strong>
                        <span className="muted" style={{ display: 'block', marginTop: 8, fontSize: '0.85rem' }}>{item.issuer}</span>
                      </span>
                      <span className="muted" style={{ fontSize: '0.78rem' }}>{item.description}</span>
                    </>
                  );
                  return (
                    <article
                      className="achievement-card"
                      key={item.id}
                      data-reveal
                      data-cursor={file ? (isPdf ? label(labels, 'common.cursorDownload', 'Download') : label(labels, 'common.cursorView', 'View')) : undefined}
                    >
                      {file && isPdf ? (
                        <a
                          className="achievement-card__open"
                          href={fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`${label(labels, 'achievements.openPrefix', 'Open ')}${item.title}`}
                        >{content}</a>
                      ) : file ? (
                        <button
                          className="achievement-card__open"
                          type="button"
                          data-lightbox-open=""
                          data-src={fileUrl}
                          data-alt={item.title}
                          data-title={item.title}
                          aria-label={`${label(labels, 'achievements.viewPrefix', 'View ')}${item.title}`}
                        >{content}</button>
                      ) : (
                        <div className="achievement-card__open">{content}</div>
                      )}
                      {item.verificationUrl && safeHttpUrl(item.verificationUrl) && (
                        <a className="link-arrow achievement-card__verify" href={safeHttpUrl(item.verificationUrl)} target="_blank" rel="noopener noreferrer">{label(labels, 'achievements.verify', 'Verify')} <ArrowUpRight className="arrow" size={14} /></a>
                      )}
                    </article>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {visible.community !== false && about.currentlyLearning.length > 0 && (
          <section className="section" id="community">
            <div className="container">
              <div className="kicker" data-scramble>{kicker('community', '(09) — Currently exploring')}</div>
              <h2 className="h2" data-split>{editorialHeading('community')}</h2>
              <div className="chip-row" data-reveal>{about.currentlyLearning.map((topic) => <span className="chip" key={topic}>{topic}</span>)}</div>
              <div className="notice" style={{ marginTop: 30 }} data-reveal>{settings.community?.notice || label(labels, 'community.notice', 'Community statistics and video tabs are omitted until verified metrics and links are supplied.')}</div>
            </div>
          </section>
        )}

        {visible.contact !== false && (
          <section className="section" id="contact" data-cta-blocker>
            <div className="container contact-grid">
              <div>
                <div className="kicker" data-scramble>{kicker('contact', '(10) — Contact')}</div>
                <h2 className="contact-title" data-split>
                  {contactLines[0]}
                  {contactLines[1] && <><br />{contactLines[1]}</>}
                  <br />
                  <em className="editorial">{contactLines[2]}</em>
                </h2>
                <p className="lede" data-reveal>{about.availability || label(labels, 'contact.availabilityFallback', 'Open to thoughtful conversations about data, products and technology.')}</p>
              </div>
              <div className="contact-panel" data-reveal>
                <div className="email-row">
                  <div><div className="mono">{label(labels, 'contact.emailLabel', 'EMAIL')}</div><strong>{email}</strong></div>
                  <button className="btn btn--ghost btn--small" type="button" data-copy-email={email} data-cursor={label(labels, 'common.cursorCopy', 'Copy')}><Copy size={14} /> <span data-copy-label>{label(labels, 'contact.copy', 'Copy')}</span></button>
                </div>
                <div className="email-row"><div className="mono">{label(labels, 'contact.locationLabel', 'LOCATION')}</div><strong>{about.location || settings.location}</strong></div>
                <div className="email-row"><div className="mono">{label(labels, 'contact.localTimeLabel', 'LOCAL TIME')}</div><strong><Clock3 size={14} style={{ display: 'inline', marginRight: 6 }} /><LocalClock timezone={settings.timezone} labels={labels} /> <span className="muted">· {settings.timezone}</span></strong></div>
                <div className="social-list">
                  {socials.map((social) => (
                    <a key={social.id} href={social.url} target="_blank" rel="noreferrer" data-cursor={label(labels, 'common.cursorVisit', 'Visit')}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>{socialIcon(social.platform)} <span data-roll>{social.label}</span></span>
                      <ArrowUpRight className="arrow" size={16} />
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}
      </main>

      <footer className="footer" data-cta-blocker>
        <div className="container">
          <div className="footer__top">
            <div>
              <div className="kicker" data-scramble>{label(labels, 'footer.kicker', 'Stay in the loop')}</div>
              <p className="lede" style={{ marginTop: 14 }}>{editorialText(settings.footerNote, label(labels, 'footer.editorialPhrase', 'bronze light'))}</p>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              {settings.appearance.terminal !== false && <Terminal data={terminalData} />}
              <a className="btn btn--ghost btn--small" href="#top"><ArrowUp size={14} /> {label(labels, 'footer.backToTop', 'Back to top')}</a>
            </div>
          </div>
          <div data-footer-mark style={{ overflow: 'hidden' }}><span>{about.headline || label(labels, 'hero.headlineFallback', 'DIVYANSH GARG')}</span></div>
          <div className="footer__bottom">
            <span>{label(labels, 'footer.copyrightPrefix', '©')} {new Date().getFullYear()} {about.headline || label(labels, 'common.name', 'Divyansh Garg')}</span>
            <span>{settings.location} · {settings.timezone}</span>
            <span>{label(labels, 'footer.signature', 'Coffee black, bronze light')}</span>
          </div>
        </div>
      </footer>

      <a className="btn btn--primary btn--small floating-cta" href={settings.cta.url || '#contact'} data-floating-cta data-magnetic="0.15" data-cursor={label(labels, 'common.cursorConnect', 'Connect')}>{settings.cta.label || label(labels, 'contact.floatingCtaFallback', "Let's talk")} <ArrowUpRight className="arrow" size={14} /></a>

      <dialog className="lightbox" data-lightbox aria-label={label(labels, 'certifications.lightboxAria', 'Certificate preview')}>
        <div className="lightbox__bar"><span data-lightbox-title>{label(labels, 'certifications.lightboxTitle', 'Certificate')}</span><button className="btn btn--ghost btn--small" type="button" data-lightbox-close><X size={14} /> {label(labels, 'common.close', 'Close')}</button></div>
        <img data-lightbox-image alt="" />
      </dialog>
    </>
  );
}
