export type VideoState = { reducedMotion: boolean; inView: boolean; userPaused: boolean };

/** The hero video plays only when motion is allowed, it is on screen and nobody paused it. */
export function shouldPlay(s: VideoState): boolean {
  return !s.reducedMotion && s.inView && !s.userPaused;
}
