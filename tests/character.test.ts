import { describe, expect, it } from 'vitest';
import { ART, CHARACTER, characterColors, characterRows, type CharacterLook } from '../src/game/character';
import { defaultContent } from '../src/core/content';

const ap = defaultContent.appearance;
const look = (patch: Partial<CharacterLook> = {}): CharacterLook => ({
  skin: '#e8b48a', hair: '#6b4423', eyes: '#3f8a3a', hairstyle: 'corti', outfit: 'casual', uniform: false, ...patch,
});

describe('personaggi', () => {
  it('ogni acconciatura e ogni abito di appearance.json ha il suo disegno', () => {
    for (const h of ap.hairstyles) expect(ART.hairstyles[h.id], h.id).toBeDefined();
    for (const o of ap.outfits) expect(ART.outfits[o.id], o.id).toBeDefined();
  });

  it('ogni combinazione dà uno sprite 20×32 con colori per tutti i caratteri', () => {
    for (const h of ap.hairstyles) for (const o of ap.outfits) for (const uniform of [false, true]) for (const back of [false, true]) for (const legs of ['stand', 'a', 'b'] as const) {
      const l = look({ hairstyle: h.id, outfit: o.id, uniform });
      const rows = characterRows(l, back, legs);
      const colors = characterColors(l);
      expect(rows.length, `${h.id} ${o.id}`).toBe(CHARACTER.h);
      for (const r of rows) {
        expect(r.length, `${h.id} ${o.id}: ${r}`).toBe(CHARACTER.w);
        for (const ch of r) if (ch !== '.') expect(colors[ch], `${h.id} ${o.id}: '${ch}'`).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it('sul campo cambia la parte di sopra, le gambe restano quelle dell\'abito', () => {
    const city = characterRows(look({ outfit: 'vestito' }));
    const field = characterRows(look({ outfit: 'vestito', uniform: true }));
    expect(field.slice(24)).toEqual(city.slice(24));
    expect(field.slice(15, 24)).not.toEqual(city.slice(15, 24));
    expect(characterColors(look({ uniform: true })).c).toBe(ART.uniform.c);
  });

  it('davanti guarda chi gioca; nei lavori può guardare in basso, di schiena non cambia nulla', () => {
    const front = characterRows(look());
    const down = characterRows(look(), false, 'stand', true);
    expect(down.slice(0, 15)).not.toEqual(front.slice(0, 15));
    expect(down.slice(15)).toEqual(front.slice(15));
    expect(characterRows(look(), true, 'stand', true)).toEqual(characterRows(look(), true));
  });

  it('il volto è simmetrico: testa dritta', () => {
    for (const row of ART.face.front) {
      const shape = row.replace(/[^.]/g, '#');
      expect(shape).toBe([...shape].reverse().join(''));
    }
  });

  it('acconciature diverse cambiano la testa', () => {
    const heads = new Set(ap.hairstyles.map((h) => characterRows(look({ hairstyle: h.id })).slice(0, 15).join('\n')));
    expect(heads.size).toBe(ap.hairstyles.length);
  });
});
