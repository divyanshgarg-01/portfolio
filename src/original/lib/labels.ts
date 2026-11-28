export type LabelMap = Record<string, unknown>;

export function label(labels: LabelMap | undefined, path: string, fallback: string): string {
  if (!labels) return fallback;
  const value = path.split('.').reduce<unknown>((current, key) => {
    if (current === null || current === undefined || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[key];
  }, labels);
  return typeof value === 'string' || typeof value === 'number' ? String(value) : fallback;
}
