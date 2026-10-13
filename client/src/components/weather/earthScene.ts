import * as THREE from "three";

const TEXTURE_ROOT = "/textures/earth/";

/** A small GPU scene, capped at 30 fps; all resources belong to this instance. */
export function createEarthScene(
  host: HTMLDivElement,
  onReady: () => void,
  onFailure: () => void
) {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "low-power",
    });
  } catch {
    onFailure();
    return () => {};
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 30);
  camera.position.set(0, 0, 5.1);
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];
  let disposed = false;
  let failed = false;
  let frame = 0;
  let lastTime = 0;
  let elapsed = 0;
  let inView = true;
  const geometry = <T extends THREE.BufferGeometry>(g: T) => {
    geometries.push(g);
    return g;
  };
  const material = <T extends THREE.Material>(m: T) => {
    materials.push(m);
    return m;
  };
  const draw = () => {
    if (!disposed && !failed) renderer.render(scene, camera);
  };
  const loader = new THREE.TextureLoader();
  function texture(name: string, color = false, primary = false) {
    const t = loader.load(
      TEXTURE_ROOT + name,
      loaded => {
        if (disposed) {
          loaded.dispose();
          return;
        }
        draw();
        if (primary && !failed) onReady();
      },
      undefined,
      () => {
        if (primary && !disposed) {
          failed = true;
          cancelAnimationFrame(frame);
          onFailure();
        }
      }
    );
    if (color) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 4);
    textures.push(t);
    return t;
  }

  scene.add(new THREE.AmbientLight(0x6e9cce, 0.6));
  const sunlight = new THREE.DirectionalLight(0xffefda, 2.6);
  sunlight.position.set(3, 2, 4);
  scene.add(sunlight);
  const rimLight = new THREE.DirectionalLight(0x0088ff, 1.1);
  rimLight.position.set(-3, 0, -1);
  scene.add(rimLight);

  const planet = new THREE.Group();
  planet.rotation.z = 0.12;
  scene.add(planet);
  const sphere = geometry(new THREE.SphereGeometry(1, 64, 48));
  const earth = new THREE.Mesh(
    sphere,
    material(
      new THREE.MeshPhongMaterial({
        map: texture("earth_atmos_2048.jpg", true, true),
        normalMap: texture("earth_normal_2048.jpg"),
        normalScale: new THREE.Vector2(0.65, 0.65),
        specularMap: texture("earth_specular_2048.jpg"),
        specular: new THREE.Color(0x557da1),
        shininess: 22,
      })
    )
  );
  earth.rotation.y = 4.0;
  planet.add(earth);

  // City lights only on the unlit hemisphere; they rotate with the surface.
  const cities = new THREE.Mesh(
    sphere,
    material(
      new THREE.ShaderMaterial({
        uniforms: {
          nightMap: { value: texture("earth_lights_2048.png", true) },
        },
        vertexShader: `varying vec2 vUv; varying vec3 vNormal;
      void main() { vUv = uv; vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position * 1.001, 1.0); }`,
        fragmentShader: `uniform sampler2D nightMap; varying vec2 vUv; varying vec3 vNormal;
      void main() { float night = 1.0 - smoothstep(-0.25, 0.3, dot(normalize(vNormal), normalize(vec3(3.0, 2.0, 4.0))));
        vec3 lights = texture2D(nightMap, vUv).rgb;
        gl_FragColor = vec4(lights * vec3(1.0, 0.8, 0.5), night * 0.8); }`,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    )
  );
  earth.add(cities);

  const clouds = new THREE.Mesh(
    sphere,
    material(
      new THREE.MeshPhongMaterial({
        alphaMap: texture("earth_clouds_1024.png"),
        transparent: true,
        opacity: 0.48,
        depthWrite: false,
        shininess: 0,
      })
    )
  );
  clouds.scale.setScalar(1.018);
  clouds.rotation.y = earth.rotation.y;
  planet.add(clouds);

  // Fresnel atmosphere: a blue illuminated limb, not a flat painted outline.
  const atmosphere = new THREE.Mesh(
    sphere,
    material(
      new THREE.ShaderMaterial({
        vertexShader: `varying vec3 vNormal; varying vec3 vView;
      void main() { vec4 p = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal); vView = normalize(-p.xyz);
        gl_Position = projectionMatrix * p; }`,
        fragmentShader: `varying vec3 vNormal; varying vec3 vView;
      void main() { float rim = pow(1.0 - max(dot(normalize(vNormal), normalize(vView)), 0.0), 3.5);
        gl_FragColor = vec4(0.12, 0.58, 1.0, rim * 0.65); }`,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    )
  );
  atmosphere.scale.setScalar(1.065);
  planet.add(atmosphere);

  // Soft luminous particles share a single generated sprite texture.
  const spriteCanvas = document.createElement("canvas");
  spriteCanvas.width = spriteCanvas.height = 64;
  const ctx = spriteCanvas.getContext("2d")!;
  const glow = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  glow.addColorStop(0, "#ffffff");
  glow.addColorStop(0.12, "#bff6ff");
  glow.addColorStop(0.3, "#27bfff99");
  glow.addColorStop(1, "#0088ff00");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 64, 64);
  const glowTexture = new THREE.CanvasTexture(spriteCanvas);
  textures.push(glowTexture);
  const orbits: {
    group: THREE.Group;
    particles: THREE.Points;
    radius: number;
    speed: number;
    count: number;
  }[] = [];
  for (let lane = 0; lane < 3; lane++) {
    const radius = 1.35 + lane * 0.15;
    const group = new THREE.Group();
    group.rotation.set(0.25 + lane * 0.32, 0, -0.22 + lane * 0.24);
    scene.add(group);
    const vertices = [];
    for (let i = 0; i <= 160; i++) {
      const angle = (i / 160) * Math.PI * 2;
      vertices.push(radius * Math.cos(angle), 0, radius * Math.sin(angle));
    }
    const ringGeometry = geometry(new THREE.BufferGeometry());
    ringGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3)
    );
    group.add(
      new THREE.Line(
        ringGeometry,
        material(
          new THREE.LineBasicMaterial({
            color: 0x28aaff,
            transparent: true,
            opacity: lane === 0 ? 0.5 : 0.26,
          })
        )
      )
    );
    const count = 24;
    const positions = new Float32Array(count * 3);
    const particleGeometry = geometry(new THREE.BufferGeometry());
    particleGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3)
    );
    const particles = new THREE.Points(
      particleGeometry,
      material(
        new THREE.PointsMaterial({
          map: glowTexture,
          color: lane === 1 ? 0x7cdfff : 0xc0efff,
          size: 0.13,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      )
    );
    group.add(particles);
    orbits.push({
      group,
      particles,
      radius,
      speed: (lane === 1 ? -1 : 1) * (0.32 + lane * 0.09),
      count,
    });
  }

  // Deterministic sparse starfield (no random changes across remounts).
  const stars = [];
  for (let i = 0; i < 95; i++) {
    const x = Math.sin(i * 127.1) * 3.8;
    const y = Math.sin(i * 311.7) * 3.8;
    stars.push(x, y, -2.5 - (i % 7) * 0.1);
  }
  const starGeometry = geometry(new THREE.BufferGeometry());
  starGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(stars, 3)
  );
  scene.add(
    new THREE.Points(
      starGeometry,
      material(
        new THREE.PointsMaterial({
          map: glowTexture,
          size: 0.035,
          color: 0x93c5fd,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
        })
      )
    )
  );

  function update() {
    earth.rotation.y = 4.0 + elapsed * 0.16;
    clouds.rotation.y = 4.0 + elapsed * 0.19;
    for (const orbit of orbits) {
      const attr = orbit.particles.geometry.getAttribute(
        "position"
      ) as THREE.BufferAttribute;
      for (let i = 0; i < orbit.count; i++) {
        const a = (i / orbit.count) * Math.PI * 2 + elapsed * orbit.speed;
        attr.setXYZ(
          i,
          orbit.radius * Math.cos(a),
          0,
          orbit.radius * Math.sin(a)
        );
      }
      attr.needsUpdate = true;
    }
  }
  function tick(now: number) {
    if (disposed || failed || document.hidden || !inView) return;
    frame = requestAnimationFrame(tick);
    if (now - lastTime < 1000 / 30) return;
    elapsed += Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;
    update();
    draw();
  }
  const resume = () => {
    cancelAnimationFrame(frame);
    lastTime = performance.now();
    if (!disposed && !failed && !document.hidden && inView)
      frame = requestAnimationFrame(tick);
  };
  const resize = () => {
    if (disposed) return;
    renderer.setSize(
      Math.max(host.clientWidth, 1),
      Math.max(host.clientHeight, 1)
    );
    camera.aspect =
      Math.max(host.clientWidth, 1) / Math.max(host.clientHeight, 1);
    camera.updateProjectionMatrix();
    draw();
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  const intersectionObserver = new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    resume();
  });
  intersectionObserver.observe(host);
  document.addEventListener("visibilitychange", resume);
  const contextLost = (event: Event) => {
    event.preventDefault();
    failed = true;
    cancelAnimationFrame(frame);
    onFailure();
  };
  renderer.domElement.addEventListener("webglcontextlost", contextLost);
  update();
  resize();
  resume();

  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    resizeObserver.disconnect();
    intersectionObserver.disconnect();
    document.removeEventListener("visibilitychange", resume);
    renderer.domElement.removeEventListener("webglcontextlost", contextLost);
    geometries.forEach(g => g.dispose());
    materials.forEach(m => m.dispose());
    textures.forEach(t => t.dispose());
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  };
}
