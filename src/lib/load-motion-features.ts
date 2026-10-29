/** Carga async de features para <LazyMotion features={loadMotionFeatures}>. */
export const loadMotionFeatures = () =>
  import("./motion-features").then((mod) => mod.default);
