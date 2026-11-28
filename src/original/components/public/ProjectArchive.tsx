'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Search } from 'lucide-react';
import { useMotion } from '@/components/motion/MotionProvider';
import { label, type LabelMap } from '@/lib/labels';
import type { Project } from '@/lib/types';

export interface ProjectCover {
  src: string;
  alt: string;
  width?: number;
  height?: number;
}

function Motif({ index }: { index: number }) {
  const shapes = [
    <>
      <circle cx="120" cy="90" r="62" />
      <circle cx="120" cy="90" r="38" />
      <path d="M58 90h124M120 28v124" />
      <path d="M74 44l92 92M166 44L74 136" />
    </>,
    <>
      <path d="M40 130c34-8 52-42 80-42s46 34 80 42" />
      <circle cx="120" cy="54" r="26" />
      <path d="M40 150h160M70 40h30M140 40h30" />
    </>,
    <>
      <rect x="54" y="38" width="132" height="104" rx="6" />
      <path d="M54 72h132M78 54h6M92 54h6M106 54h6" />
      <path d="M80 100l18 18-18 18M116 136h34" />
    </>,
  ];
  return (
    <svg viewBox="0 0 240 180" fill="none" strokeWidth="1.2" aria-hidden="true">
      {shapes[index % shapes.length]}
    </svg>
  );
}

export function ProjectArchive({
  projects,
  covers,
  labels,
}: {
  projects: Project[];
  covers: Record<string, ProjectCover>;
  labels?: LabelMap;
}) {
  const { reduced, refresh } = useMotion();
  const [active, setActive] = useState(0);
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');

  const featured = projects[Math.min(active, projects.length - 1)];
  const categories = useMemo(
    () => ['all', ...Array.from(new Set(projects.map((project) => project.category).filter(Boolean)))],
    [projects],
  );

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return projects.map((project) => {
      const inCategory = category === 'all' || project.category === category;
      const haystack = `${project.title} ${project.summary} ${project.category} ${project.status} ${project.technologies.join(' ')}`.toLowerCase();
      return inCategory && (!needle || haystack.includes(needle));
    });
  }, [projects, category, query]);

  useEffect(() => {
    if (reduced) return;
    const timer = window.setTimeout(refresh, 60);
    return () => window.clearTimeout(timer);
  }, [category, query, refresh, reduced]);

  if (!projects.length) return null;
  const cover = featured ? covers[featured.id] : undefined;

  return (
    <>
      <div className="featured" data-reveal>
        <div className="featured__selectors" role="group" aria-label={label(labels, 'projects.selectProject', 'Select a project')}>
          {projects.map((project, index) => (
            <button
              key={project.id}
              className={`featured__selector${index === active ? ' is-active' : ''}`}
              type="button"
              onClick={() => setActive(index)}
              aria-pressed={index === active}
              data-cursor={label(labels, 'common.cursorView', 'View')}
            >
              <span>0{index + 1}</span>
              <strong>{project.title}</strong>
            </button>
          ))}
        </div>
        <div className={`featured__stage${reduced ? ' featured__stage--static' : ''}`} key={featured.id}>
          <div className="featured__visual" aria-hidden="true">
            {cover?.src ? (
              <img src={cover.src} alt="" width={cover.width} height={cover.height} loading="lazy" decoding="async" />
            ) : (
              <Motif index={Math.min(active, 2)} />
            )}
          </div>
          <div className="featured__body">
            <div className="featured__meta mono">
              <span>{label(labels, 'projects.casePrefix', 'CASE / 0')}{active + 1}</span>
              <span>{featured.category}</span>
              {featured.status && <span>{featured.status}</span>}
              {featured.featured && <span>{label(labels, 'projects.featured', 'FEATURED')}</span>}
            </div>
            <h3>{featured.title}</h3>
            <p className="featured__summary">{featured.summary}</p>
            <div className="featured__rule" aria-hidden="true" />
            <div className="featured__detail">
              <span className="mono">{label(labels, 'projects.overview', 'OVERVIEW')}</span>
              <p>{featured.description}</p>
              {/draft placeholder|confirm /i.test(featured.description) && <span className="placeholder-note">{label(labels, 'projects.verifyDescription', 'Verify description')}</span>}
            </div>
            <div className="featured__detail">
              <span className="mono">{label(labels, 'projects.technologies', 'TECHNOLOGIES')}</span>
              <div className="chip-row">{featured.technologies.map((tech) => <span className="chip" key={tech}>{tech}</span>)}</div>
            </div>
            <div className="featured__links">
              {featured.liveUrl && <a className="link-arrow" href={featured.liveUrl} target="_blank" rel="noreferrer" data-cursor={label(labels, 'common.cursorVisit', 'Visit')}>{label(labels, 'projects.liveProject', 'Live project')} <ArrowUpRight className="arrow" size={14} /></a>}
              {featured.githubUrl && <a className="link-arrow" href={featured.githubUrl} target="_blank" rel="noreferrer" data-cursor={label(labels, 'common.cursorCode', 'Code')}>{label(labels, 'projects.source', 'Source')} <ArrowUpRight className="arrow" size={14} /></a>}
            </div>
          </div>
        </div>
      </div>

      <div className="archive" id="project-archive">
        <div className="archive__toolbar">
          <div className="archive__categories" role="group" aria-label={label(labels, 'projects.filterByCategory', 'Filter projects by category')}>
            {categories.map((item) => (
              <button
                key={item}
                type="button"
                className={`archive__filter${category === item ? ' is-active' : ''}`}
                onClick={() => setCategory(item)}
                aria-pressed={category === item}
              >
                {item === 'all' ? label(labels, 'projects.filterAll', 'All work') : item}
              </button>
            ))}
          </div>
          <label className="archive__search">
            <Search size={14} aria-hidden="true" />
            <span className="sr-only">{label(labels, 'projects.searchProjects', 'Search projects')}</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={label(labels, 'projects.searchProjects', 'Search projects')}
            />
          </label>
        </div>
        <p className="archive__count mono" aria-live="polite">{matches.filter(Boolean).length} / {projects.length} {label(labels, 'projects.shownSuffix', 'SHOWN')}</p>

        <div className="container" data-work-pin>
          <div className="work-progress" aria-hidden="true"><span data-work-progress /></div>
          <div className="project-track" data-work-track>
            {projects.map((project, index) => {
              const itemCover = covers[project.id];
              const visible = matches[index];
              return (
                <article
                  className={`project-card${visible ? '' : ' is-filtered'}`}
                  key={project.id}
                  hidden={!visible}
                  data-cursor={label(labels, 'common.cursorOpen', 'Open')}
                  style={{ animationDelay: `${Math.min(index, 5) * 70}ms` }}
                >
                  <div className="project-card__index">
                    {label(labels, 'projects.projectPrefix', 'PROJECT / 0')}{index + 1}
                    {project.featured && <span>{label(labels, 'projects.featuredSeparator', ' · FEATURED')}</span>}
                    {project.status && <span>{label(labels, 'projects.statusSeparator', ' · ')}{project.status}</span>}
                  </div>
                  <div className="project-card__art">
                    {itemCover?.src ? (
                      <img
                        className="project-card__cover"
                        src={itemCover.src}
                        alt={itemCover.alt || project.title}
                        width={itemCover.width}
                        height={itemCover.height}
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <Motif index={index} />
                    )}
                  </div>
                  <div className="project-card__body">
                    <h3 className="h3">{project.title}</h3>
                    <p>{project.summary}</p>
                    {/draft placeholder|confirm /i.test(project.description) && <span className="placeholder-note">{label(labels, 'projects.verifyDescription', 'Verify description')}</span>}
                    <div className="project-card__tags">{project.technologies.map((tech) => <span className="chip" key={tech}>{tech}</span>)}</div>
                    <div className="project-card__links">
                      {project.liveUrl && <a className="link-arrow" href={project.liveUrl} target="_blank" rel="noreferrer">{label(labels, 'projects.live', 'Live')} <ArrowUpRight className="arrow" size={14} /></a>}
                      {project.githubUrl && <a className="link-arrow" href={project.githubUrl} target="_blank" rel="noreferrer">{label(labels, 'projects.code', 'Code')} <ArrowUpRight className="arrow" size={14} /></a>}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
