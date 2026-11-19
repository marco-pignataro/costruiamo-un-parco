import art from '../data/personaggi.json';

/**
 * Volontari in stile chibi (16×28), composti da `personaggi.json`: volto,
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

/** Colore di ogni carattere: contorno vinaccia, ombre calde, occhi con riflesso, guance rosate. */
export function characterColors(look: CharacterLook): Record<string, string> {
  const o = ART.outfits[look.outfit] ?? Object.values(ART.outfits)[0];
  const top = look.uniform ? ART.uniform.c : o.c;
  return {
    k: '#4a1c30',
    s: look.skin,
    S: mix(look.skin, '#b0505a', 0.3),
    m: mix(look.skin, '#ef6a6a', 0.45),
    t: mix(look.skin, '#9a2f3a', 0.5),
    Z: '#f6f2ea',
    z: look.eyes,
    d: mix(look.eyes, '#1a1020', 0.45),
    h: look.hair,
    H: mix(look.hair, '#3a1530', 0.4),
    f: mix(look.hair, '#ffe0b0', 0.35),
    c: top,
    C: mix(top, '#2a1040', 0.35),
    w: look.uniform ? ART.uniform.u : o.w,
    u: look.uniform ? ART.uniform.u : top,
    p: o.p,
    P: mix(o.p, '#1a1030', 0.3),
    b: o.b,
    x: o.x ?? '#d8d4c8',
  };
}
