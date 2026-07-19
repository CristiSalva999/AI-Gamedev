import { useCallback, useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { EntityBehavior, GameBlueprint, LightingMood } from "@ai-gamedev/shared";
import { buildAssetMesh } from "../lib/three-helpers.js";

interface ThreeScene {
  containerRef: React.RefObject<HTMLDivElement>;
  /** Rebuilds the rendered scene to match a blueprint (used for live updates). */
  setBlueprint: (blueprint: GameBlueprint) => void;
}

interface EntityUserData {
  behavior: EntityBehavior;
  baseX: number;
  baseY: number;
  baseZ: number;
  phase: number;
}

const MOVE_KEYS: Record<string, [number, number]> = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

const BOUND = 11;

/**
 * Owns the imperative Three.js runtime and renders a {@link GameBlueprint} as a
 * small playable scene: themed lighting, animated entities, and a WASD/arrow-key
 * controlled player. Exposes `setBlueprint` so the UI can update it live as the
 * pipeline streams sneak peeks.
 */
export function useThreeScene(): ThreeScene {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const sceneRef = useRef<THREE.Scene | null>(null);
  const entitiesRef = useRef<THREE.Group | null>(null);
  const playerRef = useRef<THREE.Mesh | null>(null);
  const playerLightRef = useRef<THREE.PointLight | null>(null);
  const ambientRef = useRef<THREE.AmbientLight | null>(null);
  const sunRef = useRef<THREE.DirectionalLight | null>(null);
  const groundRef = useRef<THREE.Mesh | null>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const speedRef = useRef<number>(6);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#12131a");
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      55,
      container.clientWidth / container.clientHeight,
      0.1,
      1000,
    );
    camera.position.set(8, 9, 12);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 1, 0);

    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    ambientRef.current = ambient;
    scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(6, 12, 6);
    sun.castShadow = true;
    sunRef.current = sun;
    scene.add(sun);

    scene.add(new THREE.GridHelper(BOUND * 2, BOUND * 2, 0x3a3f55, 0x24283b));

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(BOUND * 2, BOUND * 2),
      new THREE.MeshStandardMaterial({ color: 0x1b1e2b, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.001;
    ground.receiveShadow = true;
    groundRef.current = ground;
    scene.add(ground);

    const entities = new THREE.Group();
    entitiesRef.current = entities;
    scene.add(entities);

    const player = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 1, 0.8),
      new THREE.MeshStandardMaterial({ color: 0x6c5ce7, emissive: 0x111111 }),
    );
    player.position.set(0, 0.5, 0);
    player.castShadow = true;
    playerRef.current = player;
    scene.add(player);

    const playerLight = new THREE.PointLight(0xffd9a0, 0, 12);
    playerLight.position.set(0, 2, 0);
    playerLightRef.current = playerLight;
    scene.add(playerLight);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code in MOVE_KEYS) {
        keysRef.current.add(e.code);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => keysRef.current.delete(e.code);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    let raf = 0;
    const clock = new THREE.Clock();
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const t = clock.elapsedTime;

      for (const child of entities.children) {
        const data = child.userData as EntityUserData;
        switch (data.behavior) {
          case "spin":
            child.rotation.y += delta * 0.8;
            break;
          case "bob":
            child.position.y = data.baseY + Math.sin(t * 2 + data.phase) * 0.35;
            break;
          case "patrol":
            child.position.x = data.baseX + Math.sin(t + data.phase) * 2;
            break;
          case "static":
            break;
          default: {
            // Exhaustiveness guard for EntityBehavior.
            const _never: never = data.behavior;
            return _never;
          }
        }
      }

      // Player movement (screen-relative on the ground plane).
      let dx = 0;
      let dz = 0;
      for (const code of keysRef.current) {
        const move = MOVE_KEYS[code];
        if (move) {
          dx += move[0];
          dz += move[1];
        }
      }
      if (dx !== 0 || dz !== 0) {
        const len = Math.hypot(dx, dz);
        const step = (speedRef.current * delta) / len;
        player.position.x = THREE.MathUtils.clamp(player.position.x + dx * step, -BOUND, BOUND);
        player.position.z = THREE.MathUtils.clamp(player.position.z + dz * step, -BOUND, BOUND);
      }
      playerLight.position.set(player.position.x, 2.2, player.position.z);

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      if (!container.clientWidth) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener("resize", onResize);
    const observer = new ResizeObserver(onResize);
    observer.observe(container);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      observer.disconnect();
      controls.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
      sceneRef.current = null;
    };
  }, []);

  const setBlueprint = useCallback((blueprint: GameBlueprint) => {
    const scene = sceneRef.current;
    const group = entitiesRef.current;
    const player = playerRef.current;
    if (!scene || !group || !player) return;

    applyEnvironment(scene, blueprint.environment, {
      ambient: ambientRef.current,
      sun: sunRef.current,
      playerLight: playerLightRef.current,
      ground: groundRef.current,
    });

    // Rebuild entities from scratch — cheap for these small scenes and keeps
    // the render a pure function of the current blueprint.
    for (const child of [...group.children]) {
      group.remove(child);
      const mesh = child as THREE.Mesh;
      mesh.geometry?.dispose();
      (mesh.material as THREE.Material | undefined)?.dispose();
    }

    for (const entity of blueprint.entities) {
      const mesh = buildAssetMesh(entity.spec);
      const baseY = Math.max(entity.spec.size.y, 0.5);
      mesh.position.set(entity.position.x, baseY, entity.position.z);
      mesh.userData = {
        behavior: entity.behavior,
        baseX: entity.position.x,
        baseY,
        baseZ: entity.position.z,
        phase: Math.random() * Math.PI * 2,
      } satisfies EntityUserData;
      group.add(mesh);
    }

    speedRef.current = blueprint.player.speed;
    (player.material as THREE.MeshStandardMaterial).color.set(blueprint.player.color);
  }, []);

  return { containerRef: containerRef as React.RefObject<HTMLDivElement>, setBlueprint };
}

interface SceneLights {
  ambient: THREE.AmbientLight | null;
  sun: THREE.DirectionalLight | null;
  playerLight: THREE.PointLight | null;
  ground: THREE.Mesh | null;
}

function applyEnvironment(
  scene: THREE.Scene,
  env: GameBlueprint["environment"],
  lights: SceneLights,
): void {
  (scene.background as THREE.Color).set(env.skyColor);
  scene.fog = env.fog ? new THREE.Fog(env.skyColor, 14, 34) : null;

  if (lights.ground) {
    (lights.ground.material as THREE.MeshStandardMaterial).color.set(env.groundColor);
  }

  const settings = lightingSettings(env.lighting);
  if (lights.ambient) lights.ambient.intensity = settings.ambient;
  if (lights.sun) {
    lights.sun.intensity = settings.sun;
    lights.sun.color.set(settings.sunColor);
  }
  if (lights.playerLight) lights.playerLight.intensity = settings.playerLight;
}

function lightingSettings(mood: LightingMood): {
  ambient: number;
  sun: number;
  sunColor: string;
  playerLight: number;
} {
  switch (mood) {
    case "day":
      return { ambient: 0.75, sun: 1.1, sunColor: "#ffffff", playerLight: 0 };
    case "dusk":
      return { ambient: 0.5, sun: 0.8, sunColor: "#ffb26b", playerLight: 0.3 };
    case "night":
      return { ambient: 0.28, sun: 0.35, sunColor: "#9db4ff", playerLight: 0.9 };
    case "cave":
      return { ambient: 0.16, sun: 0.15, sunColor: "#6673aa", playerLight: 1.4 };
    default: {
      // Exhaustiveness guard for LightingMood.
      const _never: never = mood;
      return _never;
    }
  }
}
