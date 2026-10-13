import { useEffect, useRef, useState } from "react";

/** Decorative only: the weather loading lifecycle never waits for this scene. */
export function EarthGlobe({ reducedMotion }: { reducedMotion: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(false);
    if (reducedMotion) return;
    let cancelled = false;
    let dispose: (() => void) | undefined;
    // Keep the 3D engine out of the initial application bundle.
    void import("./earthScene")
      .then(({ createEarthScene }) => {
        if (cancelled || !hostRef.current) return;
        dispose = createEarthScene(
          hostRef.current,
          () => {
            if (!cancelled) setReady(true);
          },
          () => {
            if (!cancelled) setReady(false);
          }
        );
      })
      .catch(() => {
        // The locally textured fallback remains visible if WebGL/import fails.
      });
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [reducedMotion]);

  return (
    <div className="earth-globe" data-rendered={ready} aria-hidden="true">
      <div className="earth-globe__fallback">
        <div className="earth-globe__static-orbit earth-globe__static-orbit--back" />
        <div className="earth-globe__static-earth" />
        <div className="earth-globe__static-orbit" />
      </div>
      <div ref={hostRef} className="earth-globe__canvas" />
      <span className="earth-globe__sun" />
    </div>
  );
}
