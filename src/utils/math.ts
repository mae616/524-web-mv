/**
 * 数学・補間・オーディオ計算の純粋ユーティリティ
 */

/**
 * 弾力のあるバウンスイージング（Squash & Stretch用）
 */
export function easeOutElastic(t: number): number {
  if (t === 0) return 0;
  if (t === 1) return 1;
  const p = 0.3;
  return Math.pow(2, -10 * t) * Math.sin(((t - p / 4) * (2 * Math.PI)) / p) + 1;
}

/**
 * スムーズな加減速（ジブリ的タメ・余韻用）
 */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * 自然な減速（着地・減速用）
 */
export function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

/**
 * 線形補間
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * 値の範囲クランプ
 */
export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * MIDIノート番号から周波数（Hz）を計算
 * @param midiNote A4 = 69 = 440Hz
 */
export function midiToFrequency(midiNote: number): number {
  return 440 * Math.pow(2, (midiNote - 69) / 12);
}

/**
 * C Major / A Minor ペンタトニックスケール (MIDI)
 * ルート音: C4 = 60 (C, D, E, G, A, C5, D5, E5, G5, A5)
 */
export const PENTATONIC_SCALE = [60, 62, 64, 67, 69, 72, 74, 76, 79, 81];

/**
 * インデックスからペンタトニックの周波数を取得
 */
export function getPentatonicFrequency(index: number): number {
  const note = PENTATONIC_SCALE[index % PENTATONIC_SCALE.length];
  const octaveShift = Math.floor(index / PENTATONIC_SCALE.length) * 12;
  return midiToFrequency(note + octaveShift);
}
