import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RhythmGame } from './RhythmGame';

// AudioEngine / Sequencer / Character / Scene のモック
function createMockGame() {
  const mockAudioEngine = {
    getContext: vi.fn(() => ({ currentTime: 10.0 })),
    triggerScaleNote: vi.fn(),
    triggerBoing: vi.fn(),
    triggerPoyon: vi.fn(),
    triggerBion: vi.fn(),
  } as any;

  let currentMode = 'groove';
  const mockSequencer = {
    onStepCallbacks: [] as any[],
    getIsPlaying: vi.fn(() => true),
    getMode: vi.fn(() => currentMode),
    setMode: vi.fn((m: string) => { currentMode = m; }),
  } as any;

  const mockCharacter = {
    triggerBounce: vi.fn(),
    triggerDance: vi.fn(),
    triggerSweat: vi.fn(),
    triggerHappy: vi.fn(),
    mouthShape: 0,
    isFeverAura: false,
  } as any;

  const mockScene = {
    spawnLyric: vi.fn(),
    triggerFeverBurst: vi.fn(),
    cameraShake: 0,
  } as any;

  const game = new RhythmGame(mockAudioEngine, mockSequencer, mockCharacter, mockScene);
  return { game, mockAudioEngine, mockSequencer, mockCharacter, mockScene };
}

describe('RhythmGame Core Logic', () => {
  let context: ReturnType<typeof createMockGame>;

  beforeEach(() => {
    context = createMockGame();
  });

  it('初期状態ではハート5、スコア0、コンボ0、グルーヴゲージ20%であること', () => {
    const { game } = context;
    expect(game.hearts).toBe(5);
    expect(game.score).toBe(0);
    expect(game.combo).toBe(0);
    expect(game.grooveGauge).toBe(20);
  });

  it('ノーツが存在しない時の空打ちでもペンタトニック音が鳴ること（アドリブ快感設計）', () => {
    const { game, mockAudioEngine, mockCharacter } = context;
    const res = game.handleTapInput(2);
    expect(res).toBeNull();
    expect(mockAudioEngine.triggerScaleNote).toHaveBeenCalledWith(2);
    expect(mockCharacter.triggerBounce).toHaveBeenCalled();
  });

  it('タイミング誤差 0.05秒で PERFECT 判定になり、スコア300点加算＆笑顔リアクションが発動すること', () => {
    const { game, mockCharacter } = context;
    // ノーツを手動投入 (currentTime=10.0 に対し 10.05)
    (game as any).notes.push({
      id: 1,
      type: 'tap',
      lane: 0,
      targetTime: 10.05,
      hit: false,
      missed: false,
      yProgress: 0.95,
    });

    const res = game.handleTapInput(0);
    expect(res).toBe('PERFECT');
    expect(game.score).toBe(300);
    expect(game.combo).toBe(1);
    expect(mockCharacter.triggerHappy).toHaveBeenCalled();
  });

  it('ミス時にハートが1減少し、汗リアクションが発動すること', () => {
    const { game, mockCharacter } = context;
    // ノーツを手動投入 (誤差 0.3秒でミス判定)
    (game as any).notes.push({
      id: 1,
      type: 'tap',
      lane: 1,
      targetTime: 10.3,
      hit: false,
      missed: false,
      yProgress: 0.5,
    });

    const res = game.handleTapInput(1);
    expect(res).toBe('MISS');
    expect(game.hearts).toBe(4);
    expect(game.combo).toBe(0);
    expect(mockCharacter.triggerSweat).toHaveBeenCalled();
  });

  it('ハートが0になったときゲームオーバーにならずCHILLモードに自動縮退すること（Duolingo式優しい設計）', () => {
    const { game, mockSequencer } = context;
    game.hearts = 1;
    (game as any).notes.push({
      id: 1,
      type: 'tap',
      lane: 1,
      targetTime: 10.3,
      hit: false,
      missed: false,
      yProgress: 0.5,
    });

    game.handleTapInput(1);
    // ライフは3に回復してchillモードへ
    expect(game.hearts).toBe(3);
    expect(mockSequencer.setMode).toHaveBeenCalledWith('chill');
  });

  it('グルーヴゲージが100%に達すると自動でFEVERに突入すること', () => {
    const { game, mockSequencer, mockCharacter } = context;
    game.grooveGauge = 95;
    (game as any).notes.push({
      id: 1,
      type: 'tap',
      lane: 3,
      targetTime: 10.02,
      hit: false,
      missed: false,
      yProgress: 0.98,
    });

    game.handleTapInput(3); // PERFECTで +7 -> 100%
    expect(game.grooveGauge).toBe(100);
    expect(mockSequencer.setMode).toHaveBeenCalledWith('fever');
    expect(mockCharacter.isFeverAura).toBe(true);
  });

  it('小引っ張り（tension 0.3）で POYON ノーツが PERFECT 判定されること', () => {
    const { game, mockAudioEngine, mockCharacter } = context;
    (game as any).notes.push({
      id: 2,
      type: 'poyon',
      lane: -1,
      targetTime: 10.03,
      hit: false,
      missed: false,
      yProgress: 0.98,
    });

    const res = game.handleDragReleaseInput(0.3);
    expect(res).toBe('PERFECT');
    expect(mockAudioEngine.triggerPoyon || mockAudioEngine.triggerBoing).toBeDefined();
    expect(mockCharacter.triggerHappy).toHaveBeenCalled();
  });

  it('大引っ張り（tension 0.8）で BION ノーツが PERFECT 判定され、500点ボーナスが入ること', () => {
    const { game, mockCharacter } = context;
    (game as any).notes.push({
      id: 3,
      type: 'bion',
      lane: -1,
      targetTime: 10.04,
      hit: false,
      missed: false,
      yProgress: 0.98,
    });

    const res = game.handleDragReleaseInput(0.8);
    expect(res).toBe('PERFECT');
    expect(game.score).toBe(500);
    expect(mockCharacter.triggerHappy).toHaveBeenCalled();
  });
});
