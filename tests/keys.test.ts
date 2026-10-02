import { expect, test } from 'vitest';
import { keyName } from '../src/lib/keys';

test('physical keys map regardless of layout', () => {
  expect(keyName({ code: 'KeyA', key: 'ф' })).toBe('a');
  expect(keyName({ code: 'KeyZ', key: 'я' })).toBe('z');
  expect(keyName({ code: 'Digit3', key: '3' })).toBe('3');
  expect(keyName({ code: 'Space', key: ' ' })).toBe(' ');
  expect(keyName({ code: 'ArrowLeft', key: 'ArrowLeft' })).toBe('arrowleft');
  expect(keyName({ code: '', key: 'Q' })).toBe('q');
});
