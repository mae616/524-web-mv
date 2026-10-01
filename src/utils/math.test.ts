import { describe, it, expect } from 'vitest';
import { lerp, clamp, midiToFrequency, getPentatonicFrequency, easeOutQuad } from './math';

describe('Math utilities', () => {
  it('lerp should interpolate correctly', () => {
    expect(lerp(0, 100, 0.5)).toBe(50);
    expect(lerp(10, 20, 0.25)).toBe(12.5);
  });

  it('clamp should constrain numbers', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('easeOutQuad should provide smooth easing', () => {
    expect(easeOutQuad(0)).toBe(0);
    expect(easeOutQuad(1)).toBe(1);
    expect(easeOutQuad(0.5)).toBe(0.75);
  });

  it('midiToFrequency calculates correct Hz', () => {
    // A4 = 69 = 440Hz
    expect(Math.round(midiToFrequency(69))).toBe(440);
    // A5 = 81 = 880Hz
    expect(Math.round(midiToFrequency(81))).toBe(880);
    // C4 = 60 ≈ 261.63Hz
    expect(Math.round(midiToFrequency(60))).toBe(262);
  });

  it('getPentatonicFrequency returns valid scale frequencies', () => {
    const f0 = getPentatonicFrequency(0);
    const f5 = getPentatonicFrequency(5); // 1オクターブ上のC
    expect(Math.round(f0)).toBe(262);
    expect(Math.round(f5)).toBe(523); // C5
  });
});
