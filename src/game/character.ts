import art from '../data/personaggi.json';

/**
 * Volontari 20×32 visti di tre quarti, composti da `personaggi.json`: volto,
 * acconciatura sovrapposta riga per riga, busto e gambe dell'abito scelto.
 * Sul campo il busto diventa la maglietta di gruppo e le gambe restano quelle
 * dell'abito. Niente Phaser né DOM: restituisce righe di caratteri e colori.
 */
export const CHARACTER = { w: art.size[0], h: art.size[1] };

type Side = 'front' | 'back';
type Legs = 'stand' | 'a' | 'b';
type Overlay = Record<string, string>;

interface Art {
  face: Record<Side, string[]>;
  hairstyles: Record<string, Record<Side, Overlay>>;
  torsos: Record<string, Record<Side, string[]>>;
  legs: Record<string, Record<Legs, string[]>>;
  outfits: Record<string, { torso: string; legs: string } & Record<string, string>>;
  uniform: Record<string, string>;
}
export const ART = art as unknown as Art;

/** Aspetto già tradotto in colori, più acconciatura e abito. */
export interface CharacterLook {
  skin: string;
  hair: string;
  eyes: string;
  hairstyle: string;
  outfit: string;
  /** Maglietta di gruppo di Puli-AMO al posto della parte di sopra dell'abito. */
  uniform: boolean;
}

/** Busto della maglietta di gruppo: è quello dell'abito "casual". */
const UNIFORM_TORSO = 'maglietta';

function overlay(rows: string[], ov: Overlay | undefined): void {
  for (const [r, s] of Object.entries(ov ?? {})) {
    const i = Number(r);
    const row = [...(rows[i] ?? '.'.repeat(CHARACTER.w))];
    [...s].forEach((ch, x) => {
      if (ch !== '.') row[x] = ch;
    });
    rows[i] = row.join('');
  }
}

/** Le 28 righe del volontario, davanti o di schiena, fermo o a metà passo. */
export function characterRows(look: CharacterLook, back = false, legs: Legs = 'stand'): string[] {
  const side: Side = back ? 'back' : 'front';
  const outfit = ART.outfits[look.outfit] ?? Object.values(ART.outfits)[0];
  const torso = ART.torsos[look.uniform ? UNIFORM_TORSO : outfit.torso][side];
  const rows = [...ART.face[side], ...torso, ...ART.legs[outfit.legs][legs]];
  overlay(rows, (ART.hairstyles[look.hairstyle] ?? Object.values(ART.hairstyles)[0])[side]);
  return rows;
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** Mescola due colori: t = 0 il primo, t = 1 il secondo. */
export function mix(a: string, b: string, t: number): string {
  const x = rgb(a);
  const y = rgb(b);
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

/**
 * Colore di ogni carattere. Ogni materiale ha una rampa di 3-4 toni (luce in
 * alto a sinistra, ombre verso il viola) e il tono più scuro fa da contorno,
 * come nello sprite di riferimento: niente contorno nero uguale per tutto.
 */
export function characterColors(look: CharacterLook): Record<string, string> {
  const o = ART.outfits[look.outfit] ?? Object.values(ART.outfits)[0];
  const top = look.uniform ? ART.uniform.c : o.c;
  const { hair, skin, eyes } = look;
  return {
    F: mix(hair, '#fff3c8', 0.42), f: mix(hair, '#ffe2a8', 0.2), h: hair, H: mix(hair, '#2a1030', 0.35), n: mix(hair, '#12061a', 0.62),
    a: mix(skin, '#fff4e0', 0.4), s: skin, S: mix(skin, '#8a3a3a', 0.25), D: mix(skin, '#3a1418', 0.62),
    e: '#1a1420', Z: '#f6f6f2', z: eyes, t: mix(skin, '#7a2030', 0.45),
    W: mix(top, '#ffffff', 0.35), c: top, C: mix(top, '#20103a', 0.33), K: mix(top, '#0a0614', 0.68),
    w: look.uniform ? ART.uniform.u : (o.w ?? top), u: look.uniform ? ART.uniform.u : top,
    q: mix(o.p, '#ffffff', 0.25), p: o.p, P: mix(o.p, '#101030', 0.33), Q: mix(o.p, '#05030c', 0.66),
    B: mix(o.b, '#ffffff', 0.4), b: o.b, N: mix(o.b, '#0a0610', 0.62),
    x: o.x ?? '#d8d4c8',
  };
}
