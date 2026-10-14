import { useEffect, useRef, useState } from "react";
import {
  CloudRain,
  Globe,
  Radar,
  Satellite,
  Snowflake,
  Wind,
  Droplet,
} from "lucide-react";
import posterUrl from "@/assets/earth-loader/earth-poster.webp";
import {
  MAX_FRAME_RATE,
  SCENE_START_DELAY_MS,
  getAnimationStep,
} from "./earthLoaderMotion";
import type { EarthLoaderScene } from "./earthLoaderScene";

type Props = {
  phase: string;
  variant: "full" | "light" | "compact";
  reducedMotion: boolean;
  isReady: boolean;
};

/** Progressive enhancement: the same scene's static poster is always usable. */
export function WeatherAILoaderGraphic({
  phase,
  variant,
  reducedMotion,
  isReady,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const [renderMode, setRenderMode] = useState<"static" | "webgl">("static");
  const [posterFailed, setPosterFailed] = useState(false);

  useEffect(() => {
    setRenderMode("static");
    const root = rootRef.current;
    const host = canvasHostRef.current;
    const connection = (
      navigator as Navigator & {
        connection?: { saveData?: boolean; effectiveType?: string };
      }
    ).connection;
    // No engine or textures are fetched for reduced-motion / data-saving mode.
    if (
      !root ||
      !host ||
      reducedMotion ||
      isReady ||
      connection?.saveData ||
      ["slow-2g", "2g"].includes(connection?.effectiveType ?? "")
    )
      return;

    const controller = new AbortController();
    let scene: EarthLoaderScene | null = null;
    let canvas: HTMLCanvasElement | null = null;
    let cancelled = false;
    let failed = false;
    let starting = false;
    let shown = false;
    let inViewport = !("IntersectionObserver" in window);
    let frame = 0;
    let timer: number | undefined;
    let elapsed = 0;
    let lastPaint: number | null = null;

    const active = () =>
      !cancelled && !failed && inViewport && !document.hidden;
    const pause = () => {
      window.cancelAnimationFrame(frame);
      frame = 0;
      lastPaint = null;
      window.clearTimeout(timer);
      timer = undefined;
    };
    const fail = () => {
      if (cancelled || failed) return;
      failed = true;
      pause();
      canvas?.removeEventListener("webglcontextlost", onContextLost);
      controller.abort();
      scene?.dispose();
      scene = null;
      canvas?.remove();
      setRenderMode("static");
    };
    const onContextLost = (event: Event) => {
      event.preventDefault();
      fail();
    };
    const paint = () => {
      try {
        scene?.render(elapsed);
        if (scene && !shown) {
          shown = true;
          setRenderMode("webgl");
        }
      } catch {
        fail();
      }
    };
    const animate = (now: number) => {
      frame = 0;
      if (!active() || !scene) return;
      if (lastPaint === null || now - lastPaint >= 1000 / MAX_FRAME_RATE) {
        elapsed += getAnimationStep(lastPaint, now);
        lastPaint = now;
        paint();
      }
      if (active()) frame = window.requestAnimationFrame(animate);
    };
    const resize = () => {
      if (!active() || !scene) return;
      try {
        scene.resize(host.getBoundingClientRect().width);
        paint();
      } catch {
        fail();
      }
    };
    const start = () => {
      root.dataset.paused = String(!active());
      if (!active()) {
        pause();
        return;
      }
      if (scene) {
        resize();
        if (!frame) frame = window.requestAnimationFrame(animate);
        return;
      }
      if (starting || timer !== undefined) return;
      // A quick route/cache hit never downloads the 3D chunk.
      timer = window.setTimeout(async () => {
        timer = undefined;
        if (!active()) return;
        starting = true;
        try {
          const { createEarthLoaderScene } = await import("./earthLoaderScene");
          if (cancelled || controller.signal.aborted) return;
          canvas = document.createElement("canvas");
          canvas.setAttribute("aria-hidden", "true");
          canvas.addEventListener("webglcontextlost", onContextLost);
          host.appendChild(canvas);
          const created = await createEarthLoaderScene(
            canvas,
            controller.signal
          );
          if (cancelled || controller.signal.aborted) {
            created.dispose();
            return;
          }
          scene = created;
          start();
        } catch {
          fail();
        }
      }, SCENE_START_DELAY_MS);
    };
    const intersection =
      "IntersectionObserver" in window
        ? new IntersectionObserver(entries => {
            inViewport = entries.some(entry => entry.isIntersecting);
            start();
          })
        : null;
    intersection?.observe(root);
    const observer =
      "ResizeObserver" in window ? new ResizeObserver(resize) : null;
    observer?.observe(host);
    if (!observer) window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", start);
    start();

    return () => {
      cancelled = true;
      pause();
      intersection?.disconnect();
      observer?.disconnect();
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", start);
      canvas?.removeEventListener("webglcontextlost", onContextLost);
      controller.abort();
      scene?.dispose();
      canvas?.remove();
    };
  }, [reducedMotion, isReady]);

  return (
    <div
      ref={rootRef}
      className="earth-loader"
      data-variant={variant}
      data-phase={phase}
      data-ready={isReady}
      data-render-mode={renderMode}
      aria-hidden="true"
    >
      <div className="earth-loader__nebula" />
      {posterFailed ? (
        <span className="earth-loader__emergency-globe" />
      ) : (
        <img
          src={posterUrl}
          alt=""
          width={720}
          height={720}
          decoding="async"
          fetchPriority="low"
          draggable={false}
          onError={() => setPosterFailed(true)}
          className="earth-loader__poster"
        />
      )}
      <div ref={canvasHostRef} className="earth-loader__canvas" />
      <div className="earth-loader__label earth-loader__label--stations">
        <CloudRain />
        <span>
          Stations
          <br />
          locales
        </span>
      </div>
      <div className="earth-loader__label earth-loader__label--models">
        <Satellite />
        <span>
          Modèles
          <br />
          météo
        </span>
      </div>
      <div className="earth-loader__label earth-loader__label--radar">
        <Radar />
        <span>
          Données
          <br />
          radar
        </span>
      </div>
      <div className="earth-loader__label earth-loader__label--sources">
        <Globe />
        <span>
          Sources
          <br />
          multiples
        </span>
      </div>
      <Snowflake className="earth-loader__symbol earth-loader__symbol--snow" />
      <Snowflake className="earth-loader__symbol earth-loader__symbol--snow-small" />
      <Wind className="earth-loader__symbol earth-loader__symbol--wind" />
      <Droplet className="earth-loader__symbol earth-loader__symbol--drop" />
    </div>
  );
}
