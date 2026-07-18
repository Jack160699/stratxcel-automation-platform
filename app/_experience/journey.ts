/**
 * Mutable per-frame state shared between the scroll world (GSAP/Lenis),
 * the WebGL stage and the cursor — bypasses React so nothing re-renders
 * at 60fps.
 */
export interface JourneyState {
  /** global scroll progress 0→1 */
  progress: number;
  /** pointer in NDC (-1…1) */
  pointerX: number;
  pointerY: number;
  /** press-start shockwave envelope 0→1→0 */
  burst: number;
  /** global particle opacity (intro fade-in) */
  reveal: number;
}

export function createJourneyState(): JourneyState {
  return { progress: 0, pointerX: 0, pointerY: 0, burst: 0, reveal: 0 };
}
