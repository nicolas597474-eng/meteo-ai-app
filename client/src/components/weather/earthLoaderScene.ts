import * as THREE from "three";
import dayUrl from "@/assets/earth-loader/earth-day.webp";
import normalUrl from "@/assets/earth-loader/earth-normal.webp";
import waterUrl from "@/assets/earth-loader/earth-water.webp";
import nightUrl from "@/assets/earth-loader/earth-night.webp";
import cloudsUrl from "@/assets/earth-loader/earth-clouds.webp";
import stormUrl from "@/assets/earth-loader/storm-cloud.webp";
import {
  EARTH_ORBITS,
  EARTH_RADIUS,
  MAX_CANVAS_SIZE,
  MAX_PIXEL_RATIO,
  getEarthLoaderRotation,
  getOrbitPoint,
} from "./earthLoaderMotion";

export interface EarthLoaderScene {
  render: (elapsedSeconds: number) => void;
  resize: (width: number) => void;
  dispose: () => void;
}

/** Seeded decoration: stable across mounts, renders and the static fallback. */
function seededRandom(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

const POINT_VERTEX = `
  attribute float aSize;
  attribute vec3 aColor;
  uniform float uScale;
  varying vec3 vColor;
  void main() {
    vColor = aColor;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale;
  }
`;
const POINT_FRAGMENT = `
  varying vec3 vColor;
  void main() {
    vec2 p = (gl_PointCoord - 0.5) * 2.0;
    float r = length(p);
    if (r > 1.0) discard;
    float glow = exp(-r * r * 6.0) * 0.68;
    float core = exp(-r * r * 95.0);
    float rays = (exp(-abs(p.x) * 70.0) * exp(-abs(p.y) * 5.0)
                + exp(-abs(p.y) * 70.0) * exp(-abs(p.x) * 5.0)) * 0.3;
    gl_FragColor = vec4(vColor, (glow + core + rays) * (1.0 - smoothstep(0.7, 1.0, r)));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/**
 * Loaded dynamically, after the loader has actually remained visible.
 * All textures are small, local, Vite-fingerprinted assets. There are no
 * external runtime requests, post-processing passes or weather API calls.
 */
export async function createEarthLoaderScene(
  canvas: HTMLCanvasElement,
  signal: AbortSignal
): Promise<EarthLoaderScene> {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const bitmaps = new Set<ImageBitmap>();
  let renderer: THREE.WebGLRenderer | undefined;
  let disposed = false;
  const geometry = <T extends THREE.BufferGeometry>(value: T) => {
    geometries.add(value);
    return value;
  };
  const material = <T extends THREE.Material>(value: T) => {
    materials.add(value);
    return value;
  };
  const texture = <T extends THREE.Texture>(value: T) => {
    textures.add(value);
    return value;
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener("abort", dispose);
    geometries.forEach(value => value.dispose());
    materials.forEach(value => value.dispose());
    textures.forEach(value => value.dispose());
    bitmaps.forEach(value => value.close());
    renderer?.dispose();
    if (renderer && !renderer.getContext().isContextLost())
      renderer.forceContextLoss();
  };

  const loadTexture = async (url: string, color = false) => {
    const response = await fetch(url, { signal, cache: "force-cache" });
    if (!response.ok) throw new Error("Texture du globe indisponible.");
    const bitmap = await createImageBitmap(await response.blob(), {
      imageOrientation: "flipY",
      premultiplyAlpha: "none",
      colorSpaceConversion: "none",
    });
    // Decoding is not abortable. Release a late result even after unmount.
    if (disposed || signal.aborted) {
      bitmap.close();
      throw new DOMException("Loader démonté", "AbortError");
    }
    bitmaps.add(bitmap);
    const result = texture(new THREE.Texture(bitmap));
    result.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    result.flipY = false;
    result.anisotropy = Math.min(
      renderer?.capabilities.getMaxAnisotropy() ?? 1,
      4
    );
    result.needsUpdate = true;
    return result;
  };

  try {
    signal.throwIfAborted();
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: "low-power",
    });
    signal.addEventListener("abort", dispose, { once: true });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;

    const [day, normal, water, night, clouds, storm] = await Promise.all([
      loadTexture(dayUrl, true),
      loadTexture(normalUrl),
      loadTexture(waterUrl),
      loadTexture(nightUrl, true),
      loadTexture(cloudsUrl),
      loadTexture(stormUrl, true),
    ]);
    signal.throwIfAborted();

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(
      -2.12,
      2.12,
      2.12,
      -2.12,
      0.1,
      30
    );
    camera.position.set(0, 0, 9);
    camera.lookAt(0, 0, 0);
    const sunDirection = new THREE.Vector3(3.5, 3, 4).normalize();
    scene.add(new THREE.HemisphereLight(0xc0deff, 0x314871, 1.55));
    const sunLight = new THREE.DirectionalLight(0xffeed4, 2.35);
    sunLight.position.copy(sunDirection).multiplyScalar(6);
    scene.add(sunLight);
    const fillLight = new THREE.DirectionalLight(0x7faeff, 0.4);
    fillLight.position.set(-4, 1, 2);
    scene.add(fillLight);

    // The camera faces Europe/Africa. The slight axial tilt stays fixed while
    // surface geography, relief, city lights and the cloud shell rotate in 3D.
    const globeAxis = new THREE.Group();
    globeAxis.rotation.set(0.22, 0, -0.12);
    scene.add(globeAxis);
    const globe = new THREE.Group();
    globeAxis.add(globe);
    const sphere = geometry(new THREE.SphereGeometry(EARTH_RADIUS, 72, 48));
    const surface = new THREE.Mesh(
      sphere,
      material(
        new THREE.MeshPhongMaterial({
          map: day,
          normalMap: normal,
          normalScale: new THREE.Vector2(0.55, 0.55),
          specularMap: water,
          specular: new THREE.Color(0x405b78),
          shininess: 45,
        })
      )
    );
    globe.add(surface);

    const cityLights = material(
      new THREE.ShaderMaterial({
        uniforms: {
          uMap: { value: night },
          uSunDirection: { value: sunDirection },
        },
        vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        void main() {
          vUv = uv;
          vNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
        fragmentShader: `
        uniform sampler2D uMap;
        uniform vec3 uSunDirection;
        varying vec2 vUv;
        varying vec3 vNormal;
        void main() {
          float darkness = 1.0 - smoothstep(-0.15, 0.45, dot(normalize(vNormal), uSunDirection));
          vec3 lights = texture2D(uMap, vUv).rgb;
          gl_FragColor = vec4(lights * vec3(1.4, 1.05, 0.72), darkness * 0.8);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    const nightMesh = new THREE.Mesh(sphere, cityLights);
    nightMesh.scale.setScalar(1.0008);
    globe.add(nightMesh);

    const cloudShell = new THREE.Mesh(
      sphere,
      material(
        new THREE.MeshPhongMaterial({
          color: 0xecf6ff,
          alphaMap: clouds,
          transparent: true,
          opacity: 0.79,
          depthWrite: false,
          shininess: 3,
        })
      )
    );
    cloudShell.scale.setScalar(1.013);
    globeAxis.add(cloudShell);

    const atmosphereMaterial = material(
      new THREE.ShaderMaterial({
        vertexShader: `
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
          vNormal = normalize(normalMatrix * normal);
          vView = -viewPosition.xyz;
          gl_Position = projectionMatrix * viewPosition;
        }
      `,
        fragmentShader: `
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 3.0);
          gl_FragColor = vec4(0.06, 0.57, 1.0, rim * 0.95);
        }
      `,
        transparent: true,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    const atmosphere = new THREE.Mesh(sphere, atmosphereMaterial);
    atmosphere.scale.setScalar(1.014);
    scene.add(atmosphere);
    // A feathered outer scattering halo avoids a hard blue outline. It sits
    // behind the opaque sphere; its bright limb is not painted over the land.
    const limbGlow = new THREE.Mesh(
      geometry(new THREE.PlaneGeometry(3.2, 3.2)),
      material(
        new THREE.ShaderMaterial({
          vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
          fragmentShader: `
          varying vec2 vUv;
          void main() {
            float radius = length((vUv - 0.5) * 2.0);
            float halo = exp(-abs(radius - 0.8125) * 42.0);
            float limb = exp(-abs(radius - 0.8125) * 145.0);
            gl_FragColor = vec4(0.05, 0.58, 1.0, halo * 0.5 + limb * 0.7);
          }
        `,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      )
    );
    limbGlow.position.z = -1.4;
    scene.add(limbGlow);

    // One tiny shared radial texture gives the sun and lights a bloom-like
    // glow without loading a post-processing engine or extra render targets.
    const glowCanvas = document.createElement("canvas");
    glowCanvas.width = glowCanvas.height = 128;
    const context = glowCanvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D indisponible.");
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.07, "rgba(255,255,255,0.95)");
    gradient.addColorStop(0.18, "rgba(255,255,255,0.4)");
    gradient.addColorStop(0.44, "rgba(255,255,255,0.08)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
    const glowTexture = texture(new THREE.CanvasTexture(glowCanvas));
    const addGlow = (
      color: number,
      size: number,
      x: number,
      y: number,
      z: number,
      opacity = 1
    ) => {
      const sprite = new THREE.Sprite(
        material(
          new THREE.SpriteMaterial({
            map: glowTexture,
            color,
            opacity,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          })
        )
      );
      sprite.position.set(x, y, z);
      sprite.scale.set(size, size, 1);
      scene.add(sprite);
      return sprite;
    };
    addGlow(0x087dff, 3.9, 0, 0, -1.8, 0.26);
    const sun = addGlow(0xffb657, 1.25, 1.05, 0.99, 0.5, 1.0);
    addGlow(0xfff4cf, 0.44, 1.05, 0.99, 0.51, 1.0);

    const flareCanvas = document.createElement("canvas");
    flareCanvas.width = flareCanvas.height = 256;
    const flareContext = flareCanvas.getContext("2d")!;
    for (let i = 0; i < 16; i++) {
      const angle = (i * Math.PI) / 8 + 0.08;
      const length = i % 2 === 0 ? 125 : 85;
      const x = 128 + Math.cos(angle) * length;
      const y = 128 + Math.sin(angle) * length;
      const ray = flareContext.createLinearGradient(128, 128, x, y);
      ray.addColorStop(0, "rgba(255,252,228,0.95)");
      ray.addColorStop(0.16, "rgba(255,227,171,0.55)");
      ray.addColorStop(1, "rgba(255,198,109,0)");
      flareContext.strokeStyle = ray;
      flareContext.lineWidth = i % 2 === 0 ? 1.6 : 0.8;
      flareContext.beginPath();
      flareContext.moveTo(128, 128);
      flareContext.lineTo(x, y);
      flareContext.stroke();
    }
    const flare = new THREE.Sprite(
      material(
        new THREE.SpriteMaterial({
          map: texture(new THREE.CanvasTexture(flareCanvas)),
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        })
      )
    );
    flare.position.set(1.05, 0.99, 0.53);
    flare.scale.set(1.12, 1.12, 1);
    scene.add(flare);

    const pointMaterials: THREE.ShaderMaterial[] = [];
    const makePoints = (
      positions: number[],
      sizes: number[],
      colors: number[]
    ) => {
      const buffer = geometry(new THREE.BufferGeometry());
      buffer.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3)
      );
      buffer.setAttribute("aSize", new THREE.Float32BufferAttribute(sizes, 1));
      buffer.setAttribute(
        "aColor",
        new THREE.Float32BufferAttribute(colors, 3)
      );
      const pointsMaterial = material(
        new THREE.ShaderMaterial({
          uniforms: { uScale: { value: 120 } },
          vertexShader: POINT_VERTEX,
          fragmentShader: POINT_FRAGMENT,
          transparent: true,
          blending: THREE.AdditiveBlending,
          // Rear particles really disappear behind the opaque globe.
          depthTest: true,
          depthWrite: false,
        })
      );
      pointMaterials.push(pointsMaterial);
      return new THREE.Points(buffer, pointsMaterial);
    };
    const random = seededRandom(597474);
    const starPositions: number[] = [],
      starSizes: number[] = [],
      starColors: number[] = [];
    for (let i = 0; i < 170; i++) {
      starPositions.push(
        (random() - 0.5) * 4.1,
        (random() - 0.5) * 3.9,
        -2 - random()
      );
      starSizes.push(0.012 + random() ** 5 * 0.075);
      starColors.push(0.3 + random() * 0.5, 0.6 + random() * 0.35, 1);
    }
    scene.add(makePoints(starPositions, starSizes, starColors));

    const orbitParticles: THREE.Group[] = [];
    EARTH_ORBITS.forEach((orbit, index) => {
      const plane = new THREE.Group();
      plane.rotation.set(orbit.inclination, 0, orbit.tilt);
      scene.add(plane);
      const points = Array.from(
        { length: 129 },
        (_, i) =>
          new THREE.Vector3(
            ...getOrbitPoint((i / 128) * Math.PI * 2, orbit.radius)
          )
      );
      const curve = new THREE.CatmullRomCurve3(points.slice(0, -1), true);
      for (const [thickness, opacity] of [
        [0.005, 0.86],
        [0.019, 0.1],
      ]) {
        plane.add(
          new THREE.Mesh(
            geometry(new THREE.TubeGeometry(curve, 128, thickness, 4, true)),
            material(
              new THREE.MeshBasicMaterial({
                color: index === 1 ? 0x2477ff : 0x5be1ff,
                transparent: true,
                opacity,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
              })
            )
          )
        );
      }
      const moving = new THREE.Group();
      orbitParticles.push(moving);
      plane.add(moving);
      const positions: number[] = [],
        sizes: number[] = [],
        colors: number[] = [];
      for (let i = 0; i < 52; i++) {
        const angle = (i / 52) * Math.PI * 2 + random() * 0.07;
        positions.push(
          ...getOrbitPoint(angle, orbit.radius + (random() - 0.5) * 0.018)
        );
        sizes.push(i % 7 === 0 ? 0.17 : 0.025 + random() * 0.05);
        colors.push(...(i % 13 === 0 ? [1, 0.82, 0.62] : [0.2, 0.8, 1]));
      }
      moving.add(makePoints(positions, sizes, colors));
      // Short light trails belong to the moving particles, not the fixed rings.
      for (let i = 0; i < 5; i++) {
        const positions: number[] = [],
          colors: number[] = [];
        for (let j = 0; j <= 18; j++) {
          positions.push(...getOrbitPoint(i * 1.23 + j * 0.014, orbit.radius));
          const fade = 1 - j / 19;
          colors.push(0.2 * fade, 0.8 * fade, fade);
        }
        const trail = geometry(new THREE.BufferGeometry());
        trail.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(positions, 3)
        );
        trail.setAttribute(
          "color",
          new THREE.Float32BufferAttribute(colors, 3)
        );
        moving.add(
          new THREE.Line(
            trail,
            material(
              new THREE.LineBasicMaterial({
                vertexColors: true,
                transparent: true,
                opacity: 0.8,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
              })
            )
          )
        );
      }
    });

    // Holographic concentric pedestal below the Earth, as in the reference.
    for (const radius of [0.56, 0.75, 1.01, 1.28, 1.52]) {
      const ring = new THREE.Mesh(
        geometry(new THREE.TorusGeometry(radius, 0.003, 4, 100)),
        material(
          new THREE.MeshBasicMaterial({
            color: 0x338bff,
            transparent: true,
            opacity: radius > 1.2 ? 0.22 : 0.35,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          })
        )
      );
      ring.rotation.x = Math.PI / 2 - 0.15;
      ring.position.set(0, -1.56, -0.5);
      scene.add(ring);
    }

    // Realistically lit cloud sprites keep the detailed, billowy silhouette of
    // the JPG. The globe/cloud shell and orbiting particles remain real meshes.
    const stormClouds: { sprite: THREE.Sprite; y: number }[] = [];
    const storms = [
      { x: -0.97, y: 0.7, z: 1.05, size: 0.89, rain: 0.33 },
      { x: -1.13, y: -0.31, z: 1.35, size: 1.17, rain: 0.51 },
      { x: 1.02, y: -0.5, z: 1.36, size: 1.03, rain: 0.5 },
    ];
    const rainMaterials: THREE.ShaderMaterial[] = [];
    storms.forEach(({ x, y, z, size, rain }, index) => {
      const sprite = new THREE.Sprite(
        material(
          new THREE.SpriteMaterial({
            map: storm,
            color: 0xffffff,
            toneMapped: false,
            transparent: true,
            depthWrite: false,
          })
        )
      );
      sprite.position.set(x, y, z);
      sprite.scale.set(size, size * (400 / 724), 1);
      sprite.material.rotation = index === 2 ? 0.09 : -0.08;
      scene.add(sprite);
      stormClouds.push({ sprite, y });
      const positions: number[] = [],
        phases: number[] = [];
      for (let i = 0; i < 26; i++) {
        const px = x + (random() - 0.5) * size * 0.67;
        const py = y - size * 0.12;
        const phase = random();
        const length = 0.025 + random() * 0.05;
        positions.push(
          px,
          py,
          z - 0.04,
          px - length * 0.32,
          py - length,
          z - 0.04
        );
        phases.push(phase, phase);
      }
      const rainGeometry = geometry(new THREE.BufferGeometry());
      rainGeometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3)
      );
      rainGeometry.setAttribute(
        "aPhase",
        new THREE.Float32BufferAttribute(phases, 1)
      );
      const rainMaterial = material(
        new THREE.ShaderMaterial({
          uniforms: { uTime: { value: 0 }, uLength: { value: rain } },
          vertexShader: `
          uniform float uTime;
          uniform float uLength;
          attribute float aPhase;
          varying float vOpacity;
          void main() {
            float age = fract(aPhase + uTime * 0.45);
            vec3 p = position;
            p.y -= age * uLength;
            p.x -= age * uLength * 0.25;
            vOpacity = sin(age * 3.14159) * 0.38;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }
        `,
          fragmentShader: `
          varying float vOpacity;
          void main() { gl_FragColor = vec4(0.47, 0.76, 1.0, vOpacity); }
        `,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      rainMaterials.push(rainMaterial);
      scene.add(new THREE.LineSegments(rainGeometry, rainMaterial));
      if (index > 0) {
        const bolt = [
          new THREE.Vector3(x + 0.09, y - 0.15, z + 0.02),
          new THREE.Vector3(x + 0.02, y - 0.3, z + 0.02),
          new THREE.Vector3(x + 0.09, y - 0.33, z + 0.02),
          new THREE.Vector3(x - 0.02, y - 0.52, z + 0.02),
        ];
        scene.add(
          new THREE.Line(
            geometry(new THREE.BufferGeometry().setFromPoints(bolt)),
            material(
              new THREE.LineBasicMaterial({
                color: 0xc5edff,
                transparent: true,
                opacity: 0.85,
              })
            )
          )
        );
        addGlow(0x245fff, 0.42, x + 0.04, y - 0.29, z, 0.38);
      }
    });

    // Small modeled satellite: metal body, gridded blue solar panels and dish.
    const satellite = new THREE.Group();
    const metal = material(
      new THREE.MeshPhongMaterial({ color: 0xa4c4ed, shininess: 75 })
    );
    const panels = material(
      new THREE.MeshPhongMaterial({
        color: 0x193b9d,
        specular: 0x7596ff,
        shininess: 65,
      })
    );
    const body = new THREE.Mesh(
      geometry(new THREE.CylinderGeometry(0.24, 0.24, 0.65, 20)),
      metal
    );
    satellite.add(body);
    const cap = new THREE.Mesh(
      geometry(new THREE.SphereGeometry(0.245, 20, 12)),
      metal
    );
    cap.position.y = 0.29;
    satellite.add(cap);
    const dish = new THREE.Mesh(
      geometry(
        new THREE.SphereGeometry(0.31, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2)
      ),
      material(
        new THREE.MeshPhongMaterial({
          color: 0x81b5ec,
          side: THREE.DoubleSide,
          shininess: 70,
        })
      )
    );
    dish.rotation.x = Math.PI;
    dish.position.y = -0.54;
    satellite.add(dish);
    const gridPoints: THREE.Vector3[] = [];
    for (const direction of [-1, 1]) {
      const panel = new THREE.Mesh(
        geometry(new THREE.BoxGeometry(0.81, 0.58, 0.035)),
        panels
      );
      panel.position.x = direction * 0.73;
      satellite.add(panel);
      for (let i = 0; i < 5; i++) {
        const x = direction * 0.73 - 0.405 + i * 0.2025;
        gridPoints.push(
          new THREE.Vector3(x, -0.29, 0.02),
          new THREE.Vector3(x, 0.29, 0.02)
        );
      }
      for (let i = 0; i < 4; i++) {
        const y = -0.29 + i * (0.58 / 3);
        gridPoints.push(
          new THREE.Vector3(direction * 0.73 - 0.405, y, 0.02),
          new THREE.Vector3(direction * 0.73 + 0.405, y, 0.02)
        );
      }
    }
    satellite.add(
      new THREE.LineSegments(
        geometry(new THREE.BufferGeometry().setFromPoints(gridPoints)),
        material(
          new THREE.LineBasicMaterial({
            color: 0xabc7ff,
            transparent: true,
            opacity: 0.75,
          })
        )
      )
    );
    satellite.position.set(-1.56, 1.38, 0.5);
    satellite.rotation.set(0.24, -0.3, 0.6);
    satellite.scale.setScalar(0.27);
    scene.add(satellite);

    const render = (seconds: number) => {
      if (disposed || signal.aborted) return;
      const rotation = getEarthLoaderRotation(seconds);
      globe.rotation.y = rotation.earth;
      cloudShell.rotation.y = rotation.clouds;
      orbitParticles.forEach((group, i) => {
        group.rotation.y = rotation.orbits[i];
      });
      rainMaterials.forEach(value => {
        value.uniforms.uTime.value = seconds;
      });
      stormClouds.forEach(({ sprite, y }, i) => {
        sprite.position.y = y + Math.sin(seconds * 0.45 + i) * 0.009;
      });
      sun.material.opacity = 0.94 + Math.sin(seconds * 0.6) * 0.04;
      renderer!.render(scene, camera);
    };
    return {
      render,
      resize: (width: number) => {
        if (disposed) return;
        const side = Math.max(1, Math.round(width));
        const ratio = Math.min(
          window.devicePixelRatio || 1,
          MAX_PIXEL_RATIO,
          MAX_CANVAS_SIZE / side
        );
        renderer!.setPixelRatio(ratio);
        renderer!.setSize(side, side, false);
        pointMaterials.forEach(value => {
          value.uniforms.uScale.value = (side * ratio) / 4.24;
        });
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
