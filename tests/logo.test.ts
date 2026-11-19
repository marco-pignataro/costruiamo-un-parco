import { describe, expect, it } from 'vitest';
import { LOGO_FRAMES, logoPixels, subtitleWidth } from '../src/game/logo';

describe('logo', () => {
  it('senza sottotitolo resta solo il marchio, con il sottotitolo arriva la targa sotto', () => {
    const mark = logoPixels(null);
    const withSub = logoPixels("Let's make a Park");
    expect(mark.px.filter(Boolean).length).toBeGreaterThan(1000);
    expect(withSub.px.filter((c) => c === '#f2dcae' || c === '#fff6dc').length).toBeGreaterThan(30); // lettere della targa
    expect(mark.px.filter((c) => c === '#f2dcae' || c === '#fff6dc').length).toBe(0);
    expect(logoPixels('   ')).toEqual(mark);
  });

  it('il marchio non cambia col sottotitolo: cambia solo la targa', () => {
    const a = logoPixels('Corto');
    const b = logoPixels('Un parco');
    expect(b.w).toBe(a.w);
    expect(b.px.slice(0, a.w * 20)).toEqual(a.px.slice(0, a.w * 20));
    expect(b.px).not.toEqual(a.px);
  });

  it('la targa si allarga col testo; accenti e caratteri sconosciuti non rompono nulla', () => {
    expect(subtitleWidth('Parco più verde')).toBeGreaterThan(subtitleWidth('Parco'));
    expect(subtitleWidth('à')).toBe(subtitleWidth('a'));
    expect(() => logoPixels('Ünïcødé ☺ è ok')).not.toThrow();
  });

  it("l'acqua della fontana si muove: fotogrammi diversi, stessa misura, e il giro si chiude", () => {
    const a = logoPixels(null, 0);
    const b = logoPixels(null, 3);
    expect(b.w).toBe(a.w);
    expect(b.h).toBe(a.h);
    expect(b.px).not.toEqual(a.px);
    expect(logoPixels(null, LOGO_FRAMES)).toEqual(a);
  });
});
