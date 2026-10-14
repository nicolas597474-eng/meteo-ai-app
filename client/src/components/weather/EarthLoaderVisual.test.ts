// @vitest-environment happy-dom
import * as React from "react";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WeatherAILoader } from "./WeatherAILoader";
import { WeatherAILoaderGraphic } from "./EarthLoaderVisual";
import { SCENE_START_DELAY_MS } from "./earthLoaderMotion";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  render: vi.fn(),
  resize: vi.fn(),
  dispose: vi.fn(),
}));
vi.mock("./earthLoaderScene", () => ({ createEarthLoaderScene: mocks.create }));

let root: Root;
let container: HTMLDivElement;
let intersect: (visible: boolean) => void;
let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;
let hidden: boolean;
const scene = {
  render: mocks.render,
  resize: mocks.resize,
  dispose: mocks.dispose,
};
const props = {
  phase: "init",
  variant: "full" as const,
  reducedMotion: false,
  isReady: false,
};

async function mountGraphic(overrides = {}) {
  await act(async () =>
    root.render(
      createElement(WeatherAILoaderGraphic, { ...props, ...overrides })
    )
  );
}
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
async function initializeScene() {
  await advance(SCENE_START_DELAY_MS);
  await act(async () => {
    await vi.dynamicImportSettled();
  });
}
async function setVisibility(visible: boolean) {
  await act(async () => {
    hidden = !visible;
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  hidden = false;
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => hidden,
  });
  Object.defineProperty(navigator, "connection", {
    configurable: true,
    value: undefined,
  });
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
        intersect = visible => callback([{ isIntersecting: visible }]);
      }
      observe() {
        intersect(true);
      }
      disconnect() {}
    }
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    }
  );
  frames = new Map();
  nextFrame = 1;
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback: FrameRequestCallback) => {
      const id = nextFrame++;
      frames.set(id, callback);
      return id;
    })
  );
  vi.stubGlobal(
    "cancelAnimationFrame",
    vi.fn((id: number) => frames.delete(id))
  );
  mocks.create.mockResolvedValue(scene);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete (document as unknown as { hidden?: boolean }).hidden;
  delete (navigator as Navigator & { connection?: unknown }).connection;
});

describe("EarthLoaderVisual — cycle de vie réel du composant", () => {
  it("affiche le poster immédiatement, sans initialiser le moteur sur un chargement bref", async () => {
    await mountGraphic();
    expect(container.querySelector("img")?.getAttribute("alt")).toBe("");
    expect(
      container.querySelector(".earth-loader")?.getAttribute("aria-hidden")
    ).toBe("true");
    await advance(SCENE_START_DELAY_MS - 1);
    await act(async () => root.render(null));
    await advance(1000);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
  });

  it("active la scène sans attendre de données météo et conserve les panneaux fixes", async () => {
    await mountGraphic();
    await initializeScene();
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(container.querySelector("[data-render-mode=webgl]")).not.toBeNull();
    expect(mocks.render).toHaveBeenCalledWith(0);
    expect(container.querySelectorAll(".earth-loader__label")).toHaveLength(4);
    expect(frames.size).toBe(1);
  });

  it("ne charge pas le moteur en mouvements réduits, même après plusieurs secondes", async () => {
    await mountGraphic({ reducedMotion: true });
    await advance(4000);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(container.querySelector("img")).not.toBeNull();
    expect(container.querySelector("canvas")).toBeNull();
  });

  it.each([{ saveData: true }, { effectiveType: "2g" }])(
    "économise les données réseau : %j",
    async connection => {
      Object.defineProperty(navigator, "connection", {
        configurable: true,
        value: connection,
      });
      await mountGraphic();
      await advance(4000);
      expect(mocks.create).not.toHaveBeenCalled();
      expect(frames.size).toBe(0);
    }
  );

  it("annule le démarrage si l'onglet ou le visuel est masqué avant le délai", async () => {
    await mountGraphic();
    await setVisibility(false);
    await advance(3000);
    expect(mocks.create).not.toHaveBeenCalled();
    await setVisibility(true);
    await act(async () => intersect(false));
    await advance(3000);
    expect(mocks.create).not.toHaveBeenCalled();
    await act(async () => intersect(true));
    await initializeScene();
    expect(mocks.create).toHaveBeenCalledOnce();
  });

  it("arrête et reprend la boucle en dehors du viewport et dans un onglet masqué", async () => {
    await mountGraphic();
    await initializeScene();
    await act(async () => intersect(false));
    expect(frames.size).toBe(0);
    await act(async () => intersect(true));
    expect(frames.size).toBe(1);
    await setVisibility(false);
    expect(frames.size).toBe(0);
    const renderCount = mocks.render.mock.calls.length;
    await advance(10000);
    expect(mocks.render).toHaveBeenCalledTimes(renderCount);
    await setVisibility(true);
    expect(frames.size).toBe(1);
    expect(mocks.create).toHaveBeenCalledOnce();
  });

  it("libère la scène si la préférence de mouvement change ou les données arrivent", async () => {
    await mountGraphic();
    await initializeScene();
    await mountGraphic({ reducedMotion: true });
    expect(mocks.dispose).toHaveBeenCalledOnce();
    expect(frames.size).toBe(0);
    expect(container.querySelector("canvas")).toBeNull();
    expect(container.querySelector("[data-render-mode=static]")).not.toBeNull();
    await mountGraphic({ isReady: true });
    await advance(1000);
    expect(mocks.create).toHaveBeenCalledOnce();
  });

  it("garde le poster si WebGL ou une texture échoue", async () => {
    mocks.create.mockRejectedValue(new Error("WebGL indisponible"));
    await mountGraphic();
    await initializeScene();
    expect(container.querySelector("[data-render-mode=static]")).not.toBeNull();
    expect(container.querySelector("canvas")).toBeNull();
    expect(frames.size).toBe(0);
    expect((mocks.create.mock.calls[0][1] as AbortSignal).aborted).toBe(true);
  });

  it("revient au poster après une perte de contexte, sans boucle de réinitialisation", async () => {
    await mountGraphic();
    await initializeScene();
    await act(async () =>
      container
        .querySelector("canvas")!
        .dispatchEvent(new Event("webglcontextlost", { cancelable: true }))
    );
    expect(mocks.dispose).toHaveBeenCalledOnce();
    expect(container.querySelector("[data-render-mode=static]")).not.toBeNull();
    expect(frames.size).toBe(0);
    await setVisibility(false);
    await setVisibility(true);
    await advance(1000);
    expect(mocks.create).toHaveBeenCalledOnce();
  });

  it("libère aussi une scène asynchrone qui arrive après le démontage", async () => {
    let resolve!: (value: typeof scene) => void;
    mocks.create.mockImplementation(
      () =>
        new Promise(done => {
          resolve = done;
        })
    );
    await mountGraphic();
    await initializeScene();
    await act(async () => root.render(null));
    expect((mocks.create.mock.calls[0][1] as AbortSignal).aborted).toBe(true);
    await act(async () => resolve(scene));
    expect(mocks.dispose).toHaveBeenCalledOnce();
    expect(frames.size).toBe(0);
    expect(container.children).toHaveLength(0);
  });
});

describe("WeatherAILoader — ne retarde pas la disponibilité des données", () => {
  it("ne monte rien et ne notifie aucune sortie quand loading est initialement false", async () => {
    const onTransitionEnd = vi.fn();
    await act(async () =>
      root.render(
        createElement(WeatherAILoader, { loading: false, onTransitionEnd })
      )
    );
    await advance(1000);
    expect(container.children).toHaveLength(0);
    expect(onTransitionEnd).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("conserve le message accessible et finit indépendamment des phases et de la 3D", async () => {
    const onTransitionEnd = vi.fn();
    const render = (loading: boolean) =>
      act(async () =>
        root.render(
          createElement(WeatherAILoader, {
            loading,
            message: "Chargement des prévisions",
            onTransitionEnd,
          })
        )
      );
    await render(true);
    expect(
      container.querySelector('[role="status"]')?.getAttribute("aria-busy")
    ).toBe("true");
    expect(container.textContent).toContain("Chargement des prévisions");
    await advance(80);
    await render(false);
    expect(
      container.querySelector('[role="status"]')?.getAttribute("aria-busy")
    ).toBe("false");
    await advance(340);
    expect(container.children).toHaveLength(0);
    expect(onTransitionEnd).toHaveBeenCalledOnce();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("annule la sortie si un nouveau chargement démarre, puis nettoie les timers", async () => {
    const onTransitionEnd = vi.fn();
    const render = (loading: boolean) =>
      act(async () =>
        root.render(
          createElement(WeatherAILoader, {
            loading,
            reducedMotion: true,
            onTransitionEnd,
          })
        )
      );
    await render(true);
    await advance(2700);
    expect(container.textContent).toContain(
      "Analyse et fusion des données météo"
    );
    await render(false);
    await advance(100);
    await render(true);
    await advance(340);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(onTransitionEnd).not.toHaveBeenCalled();
    await act(async () => root.render(null));
    expect(vi.getTimerCount()).toBe(0);
  });
});
