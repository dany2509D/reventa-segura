import { describe, expect, it } from 'vitest';
import { shouldPlay } from './video-state';

describe('shouldPlay', () => {
  it('plays only when motion is allowed, the video is on screen and the person did not pause it', () => {
    expect(shouldPlay({ reducedMotion: false, inView: true, userPaused: false })).toBe(true);
    expect(shouldPlay({ reducedMotion: true, inView: true, userPaused: false })).toBe(false);
    expect(shouldPlay({ reducedMotion: false, inView: false, userPaused: false })).toBe(false);
    expect(shouldPlay({ reducedMotion: false, inView: true, userPaused: true })).toBe(false);
  });
});
