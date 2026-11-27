'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import { Compass, Layers, Search, Sparkles } from 'lucide-react';
import { useMotion } from '@/components/motion/MotionProvider';
import type { AboutRecord, Experience, Project, Skill } from '@/lib/types';

interface Panel {
  id: string;
  number: string;
  title: string;
  source: string;
  text: string;
  chips: string[];
  icon: typeof Compass;
}

export function HowIBuild({
  about,
  experience,
  projects,
  skills,
}: {
  about: AboutRecord;
  experience: Experience[];
  projects: Project[];
  skills: Skill[];
}) {
  const { reduced } = useMotion();
  const [active, setActive] = useState(0);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);

  const research = experience.find((item) => /vled|research/i.test(`${item.organization} ${item.role}`)) ?? experience[0];
  const featured = projects.find((project) => project.featured) ?? projects[0];
  const dataSkills = skills
    .filter((skill) => /data|sql|python|analysis/i.test(skill.name))
    .map((skill) => skill.name);
  const buildSkills = skills
    .filter((skill) => /react|git|web|full-stack/i.test(skill.name))
    .map((skill) => skill.name);

  const panels: Panel[] = [
    {
      id: 'frame',
      number: '01',
      title: 'Frame the question',
      source: 'FROM THE PROFILE',
      text: about.intro || about.bio.split('\n\n')[0],
      chips: about.interests,
      icon: Compass,
    },
    {
      id: 'evidence',
      number: '02',
      title: 'Follow the evidence',
      source: research ? `${research.role.toUpperCase()} · ${research.organization.toUpperCase()}` : 'FROM THE RESEARCH',
      text: research?.highlights.length
        ? `Research focus: ${research.highlights.join(', ')}.`
        : about.bio.split('\n\n')[0],
      chips: [...new Set([...dataSkills, ...(research?.tags ?? [])])],
      icon: Search,
    },
    {
      id: 'build',
      number: '03',
      title: 'Build in the open',
      source: featured ? `FROM ${featured.title.toUpperCase()}` : 'FROM THE WORK',
      text: featured?.summary || about.bio.split('\n\n')[0],
      chips: [...new Set([...(featured?.technologies ?? []), ...buildSkills])],
      icon: Layers,
    },
    {
      id: 'explore',
      number: '04',
      title: 'Keep exploring',
      source: 'CURRENTLY LEARNING',
      text: about.bio.split('\n\n')[0],
      chips: about.currentlyLearning,
      icon: Sparkles,
    },
  ].filter((panel) => panel.text && panel.chips.length > 0);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    let next = index;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % panels.length;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + panels.length) % panels.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = panels.length - 1;
    setActive(next);
    tabs.current[next]?.focus();
  };

  if (!panels.length) return null;
  const panel = panels[Math.min(active, panels.length - 1)];
  const Icon = panel.icon;

  return (
    <div className={`approach${reduced ? ' approach--static' : ''}`}>
      <div className="approach__tabs" role="tablist" aria-label="How I approach the work">
        {panels.map((entry, index) => (
          <button
            key={entry.id}
            ref={(node) => { tabs.current[index] = node; }}
            className={`approach__tab${index === active ? ' is-active' : ''}`}
            type="button"
            role="tab"
            id={`approach-tab-${entry.id}`}
            aria-controls={`approach-panel-${entry.id}`}
            aria-selected={index === active}
            tabIndex={index === active ? 0 : -1}
            onClick={() => setActive(index)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            <span>{entry.number}</span>
            <strong>{entry.title}</strong>
          </button>
        ))}
      </div>
      <div
        className="approach__panel"
        role="tabpanel"
        id={`approach-panel-${panel.id}`}
        aria-labelledby={`approach-tab-${panel.id}`}
        key={panel.id}
        data-reveal
      >
        <div className="approach__icon" aria-hidden="true"><Icon size={22} strokeWidth={1.4} /></div>
        <div className="approach__content">
          <span className="mono">{panel.source}</span>
          <h3>{panel.title}</h3>
          <p className="approach__statement">{panel.text}</p>
          <div className="chip-row">{panel.chips.map((chip) => <span className="chip" key={chip}>{chip}</span>)}</div>
        </div>
        <div className="approach__index" aria-hidden="true">{panel.number}<span> / 0{panels.length}</span></div>
      </div>
      <p className="approach__note">Drawn from the profile and work recorded in this portfolio.</p>
    </div>
  );
}
