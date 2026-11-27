'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useMotion } from './MotionProvider';

export interface TerminalData {
  name: string;
  role: string;
  location: string;
  about: string;
  email: string;
  projects: Array<{ title: string; status: string; url: string }>;
  skills: string[];
  experience: Array<{ role: string; organization: string }>;
  education: string[];
  socials: Array<{ label: string; url: string }>;
}

type Line = { text: string; kind: 'command' | 'output' | 'heading' };

export function Terminal({ data }: { data: TerminalData }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [lines, setLines] = useState<Line[]>([
    { text: 'Interactive portfolio terminal. Type help to see available commands.', kind: 'output' },
  ]);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const { stopScroll, startScroll, reduced } = useMotion();

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
      if (event.key === '`' && !typing && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        setOpen((current) => !current);
      }
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open) {
      startScroll();
      return;
    }
    stopScroll();
    window.setTimeout(() => inputRef.current?.focus(), 60);
  }, [open, startScroll, stopScroll]);

  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [lines]);

  const run = (raw: string) => {
    const command = raw.trim().toLowerCase();
    const append = (...next: Line[]) => setLines((current) => [...current, ...next]);
    append({ text: `visitor@divyansh:~$ ${raw}`, kind: 'command' });
    setHistory((current) => [raw, ...current]);
    setHistoryIndex(-1);

    switch (command) {
      case 'help':
        append(
          { text: 'available commands:', kind: 'heading' },
          { text: 'help · about · projects · skills · experience · education · achievements · contact · socials · clear · exit', kind: 'output' },
        );
        break;
      case 'whoami':
      case 'about':
        append({ text: `${data.name} — ${data.role}`, kind: 'heading' }, { text: data.about, kind: 'output' });
        break;
      case 'projects':
        if (!data.projects.length) append({ text: 'No published projects yet.', kind: 'output' });
        else data.projects.forEach((project, index) => append({ text: `${index + 1}. ${project.title} [${project.status}] ${project.url}`, kind: 'output' }));
        break;
      case 'skills':
        append({ text: data.skills.join(' · ') || 'No skills published yet.', kind: 'output' });
        break;
      case 'experience':
        if (data.experience.length) {
          data.experience.forEach((item) => append({ text: `${item.role} @ ${item.organization}`, kind: 'output' }));
        } else {
          append({ text: 'No experience published yet.', kind: 'output' });
        }
        break;
      case 'education':
        append(...(data.education.length ? data.education.map((item) => ({ text: item, kind: 'output' as const })) : [{ text: 'No education published yet.', kind: 'output' as const }]));
        break;
      case 'achievements':
      case 'research':
        append({ text: 'Certificates are listed in the Certifications section; other achievements are in Achievements.', kind: 'output' });
        break;
      case 'contact':
        append({ text: `Email: ${data.email}`, kind: 'heading' }, { text: 'Use the copy-email button or reach out on a linked social platform.', kind: 'output' });
        break;
      case 'socials':
        if (data.socials.length) {
          data.socials.forEach((social) => append({ text: `${social.label}: ${social.url}`, kind: 'output' }));
        } else {
          append({ text: 'No social links published yet.', kind: 'output' });
        }
        break;
      case 'mentor':
        append({ text: 'Mentorship is not enabled in this portfolio.', kind: 'output' });
        break;
      case 'sudo hire divyansh':
        append({ text: 'Permission denied — but collaboration is welcome. Use the contact command.', kind: 'output' });
        break;
      case 'clear':
        setLines([]);
        return;
      case 'exit':
        setOpen(false);
        return;
      default:
        append({ text: `command not found: ${command}. Type help.`, kind: 'output' });
    }
  };

  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      run(value);
      setValue('');
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      const next = Math.min(historyIndex + 1, history.length - 1);
      if (next >= 0) { setHistoryIndex(next); setValue(history[next]); }
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const next = historyIndex - 1;
      if (next < 0) { setHistoryIndex(-1); setValue(''); }
      else { setHistoryIndex(next); setValue(history[next]); }
    }
  };

  return (
    <>
      <button className="btn btn--ghost btn--small" type="button" onClick={() => setOpen(true)} data-cursor="Open">
        Open terminal <span className="mono">`</span>
      </button>
      {open && (
        <div
          className="terminal-backdrop is-open"
          role="presentation"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}
        >
          <div className="terminal" role="dialog" aria-modal="true" aria-label="Portfolio terminal">
            <div className="terminal__bar">
              <span>visitor@divyansh:~</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span>ESC to close</span>
                <span className="terminal__dots"><i /><i /><i /></span>
              </div>
            </div>
            <div className="terminal__output" ref={outputRef} aria-live="polite">
              {lines.map((line, index) => (
                <div key={`${index}-${line.text}`} className={`terminal__line terminal__line--${line.kind}`}>{line.text}</div>
              ))}
            </div>
            <form className="terminal__form" onSubmit={(event) => { event.preventDefault(); run(value); setValue(''); }}>
              <span>❯</span>
              <input
                ref={inputRef}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                onKeyDown={onInputKeyDown}
                aria-label="Terminal command"
                autoComplete="off"
                spellCheck={false}
                placeholder={reduced ? 'type a command' : 'type help'}
              />
              <button type="submit" className="terminal__hint" tabIndex={-1}>↵</button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
