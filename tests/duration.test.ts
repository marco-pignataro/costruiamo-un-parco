import { describe, expect, it } from 'vitest';
import { computeDuration } from '../src/core/duration';

const base = { skills: [] as string[] };
const falegname = { skills: ['legno'] };

describe('formula delle durate (esempio della panchina, 10 ore)', () => {
  it('1 volontario base: 10 ore, qualità base', () => {
    expect(computeDuration(10, 'legno', [base])).toMatchObject({ hours: 10, quality: 'base' });
  });

  it('2 volontari base: 5 ore', () => {
    expect(computeDuration(10, 'legno', [base, base]).hours).toBeCloseTo(5);
  });

  it('1 falegname: circa 9 ore, qualità alta', () => {
    const r = computeDuration(10, 'legno', [falegname]);
    expect(r.hours).toBeCloseTo(9.09, 2);
    expect(r.quality).toBe('alta');
  });

  it('1 falegname + 2 base: circa 2 ore grazie all’effetto guida', () => {
    const r = computeDuration(10, 'legno', [falegname, base, base]);
    expect(r.hours).toBeCloseTo(1.96, 2);
    expect(r.quality).toBe('alta');
  });

  it('uno specialista guida al massimo 2 volontari', () => {
    expect(computeDuration(10, 'legno', [falegname, base, base, base]).efficiency).toBeCloseTo(6.1);
  });

  it('senza skill richiesta nessuno è specialista', () => {
    expect(computeDuration(12, null, [falegname, base, base]).hours).toBeCloseTo(4);
  });
});
