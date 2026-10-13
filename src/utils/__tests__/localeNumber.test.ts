import assert from 'node:assert/strict';
import test from 'node:test';
import { formatFixed, formatNumber, localeFormat } from '../localeNumber';
import { formatFileSize, formatPolygonCountCompact } from '../meshStatsFormatting';

test('formatFixed uses the locale decimal separator', () => {
  assert.equal(formatFixed(28.034, 2, 'en'), '28.03');
  assert.equal(formatFixed(28.034, 2, 'es'), '28,03');
  assert.equal(formatFixed(0.5, 0, 'en'), '1');
  assert.equal(formatFixed(3, 1, 'es'), '3,0');
});

test('formatFixed groups thousands per locale', () => {
  assert.equal(formatFixed(560464, 0, 'en'), '560,464');
  assert.equal(formatFixed(560464, 0, 'es'), '560.464');
  // Spanish CLDR only groups from five digits up.
  assert.equal(formatFixed(1234.5, 1, 'es'), '1234,5');
  assert.equal(formatFixed(1234.5, 1, 'en'), '1,234.5');
});

test('formatNumber passes Intl options through and caches per locale', () => {
  assert.equal(formatNumber(0.25, 'en', { style: 'percent' }), '25%');
  assert.equal(formatNumber(0.25, 'es', { style: 'percent' }), '25 %');
  assert.equal(formatNumber(1.5, 'en', { maximumFractionDigits: 2 }), '1.5');
  assert.equal(formatNumber(1.5, 'es', { maximumFractionDigits: 2 }), '1,5');
});

test('formatFileSize follows the locale and keeps its units', () => {
  const size = 28.03 * 1024 * 1024;
  assert.equal(formatFileSize(size, localeFormat('en')), '28.03 MB');
  assert.equal(formatFileSize(size, localeFormat('es')), '28,03 MB');
  assert.equal(formatFileSize(1536, localeFormat('es')), '1,5 KB');
  assert.equal(formatFileSize(512, localeFormat('es')), '512 B');
  assert.equal(formatFileSize(0, localeFormat('es')), null);
});

test('formatPolygonCountCompact follows the locale and keeps its suffixes', () => {
  assert.equal(formatPolygonCountCompact(1_376_686, localeFormat('en')), '1.38M');
  assert.equal(formatPolygonCountCompact(1_376_686, localeFormat('es')), '1,38M');
  assert.equal(formatPolygonCountCompact(5_500, localeFormat('es')), '5,5K');
  assert.equal(formatPolygonCountCompact(50_000, localeFormat('es')), '50K');
  assert.equal(formatPolygonCountCompact(999, localeFormat('es')), '999');
});
