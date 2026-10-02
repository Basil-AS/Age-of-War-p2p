import { describe, expect, it } from 'vitest';
import { AGE_NAMES, ROUTE_NAMES, STATUS_NAMES, STRINGS, VIA_NAMES } from '../src/lib/i18n';
import { STRINGS as LITE } from '../src/lite/lib/i18n';

describe('i18n parity', () => {
  for (const [name, S] of [
    ['main', STRINGS],
    ['lite', LITE],
  ] as const) {
    it(`${name}: ru and en have identical keys and no empty strings`, () => {
      const en = Object.keys(S.en).sort();
      const ru = Object.keys(S.ru).sort();
      expect(ru).toEqual(en);
      for (const lang of ['en', 'ru'] as const)
        for (const [k, v] of Object.entries(S[lang] as Record<string, unknown>)) {
          const flat = Array.isArray(v) ? v.join('') : String(v);
          expect(flat.trim().length, `${lang}.${k}`).toBeGreaterThan(0);
        }
    });
  }
  it('route / status / via name tables are complete in both languages', () => {
    for (const T of [ROUTE_NAMES, STATUS_NAMES, VIA_NAMES])
      expect(Object.keys(T.ru).sort()).toEqual(Object.keys(T.en).sort());
    for (const id of [
      'nostr',
      'torrent',
      'mqtt',
      'turn',
      'relay-nostr',
      'relay-mqtt',
      'relay-ws',
      'lan',
      'local',
      'manual',
    ])
      expect(ROUTE_NAMES.en[id], id).toBeTruthy();
    expect(AGE_NAMES.en.length).toBe(AGE_NAMES.ru.length);
  });
});
