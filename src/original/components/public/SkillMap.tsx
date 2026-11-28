'use client';

import { useEffect, useState } from 'react';
import {
  BarChart3,
  Brain,
  Briefcase,
  Code2,
  Database,
  FileCode,
  GitBranch,
  Layers,
  Network,
  Package,
  Plug,
  Puzzle,
  Server,
  Sparkles,
  Target,
  Terminal,
  TrendingUp,
  WandSparkles,
  type LucideIcon,
} from 'lucide-react';
import { useMotion } from '@/components/motion/MotionProvider';
import { label, type LabelMap } from '@/lib/labels';
import type { Skill, SkillCategory } from '@/lib/types';

const ICONS: Record<string, LucideIcon> = {
  'mern stack': Layers,
  mongodb: Database,
  'express.js': Server,
  react: Code2,
  'node.js': Server,
  javascript: FileCode,
  html5: FileCode,
  css3: Layers,
  'rest apis': Network,
  python: Code2,
  'programming fundamentals': Terminal,
  'git & github': GitBranch,
  'software development': Code2,
  'data analytics': BarChart3,
  'data science': BarChart3,
  'python for data analysis': Code2,
  'exploratory data analysis': BarChart3,
  'data cleaning': BarChart3,
  'data visualization': BarChart3,
  statistics: TrendingUp,
  sql: Database,
  pandas: BarChart3,
  numpy: BarChart3,
  'artificial intelligence': Brain,
  'machine learning': Brain,
  'generative ai': WandSparkles,
  'large language models (llms)': Network,
  'ai applications': Sparkles,
  'machine learning fundamentals': Brain,
  'business analysis': Briefcase,
  'business management': Briefcase,
  'product thinking': Package,
  'business strategy': Briefcase,
  'problem solving': Puzzle,
  entrepreneurship: Target,
  'vs code': Terminal,
  'api integration': Plug,
  'data architecture': Database,
  'product strategy': Target,
};

interface SkillGroup {
  id: string;
  title: string;
  description: string;
  order: number;
  skills: Skill[];
}

function iconFor(name: string): LucideIcon {
  return ICONS[name.trim().toLowerCase()] ?? Sparkles;
}

function ordinal(index: number): string {
  return String(index + 1).padStart(2, '0');
}

export function SkillMap({ categories, skills, labels }: { categories: SkillCategory[]; skills: Skill[]; labels?: LabelMap }) {
  const { reduced, lenis } = useMotion();
  const [activeId, setActiveId] = useState('');

  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  const groups: SkillGroup[] = categories
    .map((category) => ({
      id: category.id,
      title: category.title,
      description: category.description,
      order: category.order,
      skills: skills
        .filter((skill) => skill.categoryId === category.id)
        .sort((a, b) => a.order - b.order),
    }))
    .filter((group) => group.skills.length > 0)
    .sort((a, b) => a.order - b.order);

  // A mistyped CMS category ID must not make a published skill disappear.
  const orphans = skills.filter((skill) => !categoryMap.has(skill.categoryId));
  if (orphans.length) {
    groups.push({
      id: 'other',
      title: label(labels, 'skills.otherTitle', 'Other skills'),
      description: label(labels, 'skills.otherDescription', 'Published skills awaiting a category in the CMS.'),
      order: Number.MAX_SAFE_INTEGER,
      skills: orphans.sort((a, b) => a.order - b.order),
    });
  }

  const groupKey = groups.map((group) => group.id).join('|');

  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-skill-group]'));
    if (!nodes.length || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      const first = visible[0];
      if (first) setActiveId((first.target as HTMLElement).dataset.skillGroupId ?? '');
    }, { rootMargin: '-18% 0px -66% 0px', threshold: 0 });
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [groupKey]);

  const jumpTo = (id: string) => {
    const target = document.getElementById(`skill-group-${id}`);
    if (!target) return;
    if (!reduced && lenis) lenis.scrollTo(target, { offset: -110 });
    else target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  };

  return (
    <div className="skill-map">
      <nav className="skill-rail" aria-label={label(labels, 'skills.categoriesAria', 'Skill categories')}>
        {groups.map((group, index) => (
          <button
            className="skill-rail__item"
            key={group.id}
            type="button"
            data-skill-nav
            data-skill-target={group.id}
            aria-pressed={activeId === group.id}
            onClick={() => jumpTo(group.id)}
          >
            <span className="skill-rail__num">{ordinal(index)}</span>
            <span className="skill-rail__name">{group.title}</span>
            <span className="skill-rail__count">{group.skills.length}</span>
          </button>
        ))}
      </nav>

      <div className="skill-groups">
        {groups.map((group, index) => (
          <article
            className="skill-group"
            id={`skill-group-${group.id}`}
            key={group.id}
            data-skill-group
            data-skill-group-id={group.id}
          >
            <div className="skill-group__head">
              <span className="skill-group__index">{ordinal(index)}</span>
              <div className="skill-group__intro">
                <h3 className="skill-group__title" data-skill-heading>{group.title}</h3>
                {group.description && <p className="skill-group__desc">{group.description}</p>}
              </div>
              <span className="skill-group__count">{String(group.skills.length).padStart(2, '0')}{label(labels, 'skills.skillsSuffix', ' / SKILLS')}</span>
              <span className="skill-group__stars" aria-hidden="true"><i /><i /><i /></span>
            </div>
            <ul className="skill-tokens">
              {group.skills.map((skill) => {
                const Icon = iconFor(skill.name);
                return (
                  <li
                    className={`skill-token${skill.featured ? ' skill-token--core' : ''}`}
                    key={skill.id}
                    data-skill-token
                    title={skill.note || undefined}
                  >
                    <span className="skill-token__icon" aria-hidden="true"><Icon size={16} strokeWidth={1.6} /></span>
                    <span className="skill-token__name">{skill.name}</span>
                    {skill.featured && <span className="skill-token__tag">{label(labels, 'skills.coreFocus', 'Core focus')}</span>}
                  </li>
                );
              })}
            </ul>
          </article>
        ))}
      </div>
    </div>
  );
}
