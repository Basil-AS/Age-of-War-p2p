/** Layout-independent key name: physical key (`e.code`) first, so hotkeys work on a Russian layout too. */
export function keyName(e: Pick<KeyboardEvent, 'code' | 'key'>): string {
  const c = e.code ?? '';
  if (/^Key[A-Z]$/.test(c)) return c.slice(3).toLowerCase();
  if (/^Digit\d$/.test(c)) return c.slice(5);
  if (/^Numpad\d$/.test(c)) return c.slice(6);
  if (c === 'Space') return ' ';
  if (c === 'Escape') return 'escape';
  if (c === 'Enter' || c === 'NumpadEnter') return 'enter';
  if (c.startsWith('Arrow')) return c.toLowerCase();
  return (e.key ?? '').toLowerCase();
}
