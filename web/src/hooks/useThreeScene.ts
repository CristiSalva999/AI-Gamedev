import { useCallback, useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  sampleClip,
  type AnimationClip,
  type EntityBehavior,
  type GameBlueprint,
  type LightingMood,
} from "@ai-gamedev/shared";
import { buildAssetMesh, disposeObject3D } from "../lib/three-helpers.js";

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
  baseScaleY: number;
  phase: number;
  animation?: AnimationClip;
  interactive: boolean;
  collected: boolean;
  entityId: string;
  name: string;
  hint?: string;
  footprint: number;
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

const DEFAULT_BOUND = 18;

/** True when the user is typing in an input/textarea/contenteditable. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

/**
 * Owns the imperative Three.js runtime and renders a {@link GameBlueprint} as a
 * playable scene: themed lighting, compound prefab props, WASD movement, and
 * proximity collectibles (press E).
 */
export function useThreeScene(): ThreeScene {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const sceneRef = useRef<THREE.Scene | null>(null);
  const entitiesRef = useRef<THREE.Group | null>(null);
  const decorRef = useRef<THREE.Group | null>(null);
  const playerRef = useRef<THREE.Group | null>(null);
  const playerLightRef = useRef<THREE.PointLight | null>(null);
  const ambientRef = useRef<THREE.AmbientLight | null>(null);
  const sunRef = useRef<THREE.DirectionalLight | null>(null);
  const groundRef = useRef<THREE.Mesh | null>(null);
  const accentGroundRef = useRef<THREE.Mesh | null>(null);
  const gridRef = useRef<THREE.GridHelper | null>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const speedRef = useRef<number>(6);
  const boundRef = useRef<number>(DEFAULT_BOUND);
  const playerAnimsRef = useRef<GameBlueprint["player"]["animations"] | null>(null);
  const playerBaseYRef = useRef(0.6);
  const playFocusedRef = useRef(false);
  /** Respawn only when a brand-new game starts — not on every sneak-peek. */
  const activeGameKeyRef = useRef<string>("");
  const collectedRef = useRef<Set<string>>(new Set());
  const hintElRef = useRef<HTMLDivElement | null>(null);
  const lootElRef = useRef<HTMLDivElement | null>(null);
  const nearEntityRef = useRef<THREE.Object3D | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.tabIndex = 0;
    container.setAttribute("role", "application");
    container.setAttribute(
      "aria-label",
      "Game preview. Click to focus, then use WASD or arrow keys to move. Press E to interact.",
    );

    const hint = document.createElement("div");
    hint.className = "viewport-hint";
    hint.hidden = true;
    container.appendChild(hint);
    hintElRef.current = hint;

    const loot = document.createElement("div");
    loot.className = "viewport-loot";
    loot.textContent = "Loot: 0";
    container.appendChild(loot);
    lootElRef.current = loot;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#87c4d9");
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      50,
      Math.max(container.clientWidth, 1) / Math.max(container.clientHeight, 1),
      0.1,
      200,
    );
    camera.position.set(10, 12, 16);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 1.2, -2);
    controls.maxPolarAngle = Math.PI * 0.48;

    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    ambientRef.current = ambient;
    scene.add(ambient);

    const hemi = new THREE.HemisphereLight(0xb8e0ff, 0x3d6b45, 0.45);
    scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff2d6, 1.15);
    sun.position.set(10, 18, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 60;
    sun.shadow.camera.left = -30;
    sun.shadow.camera.right = 30;
    sun.shadow.camera.top = 30;
    sun.shadow.camera.bottom = -30;
    sunRef.current = sun;
    scene.add(sun);

    const bound = DEFAULT_BOUND;
    const grid = new THREE.GridHelper(bound * 2, Math.floor(bound), 0x4a7a55, 0x2f5538);
    grid.position.y = 0.01;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.35;
    gridRef.current = grid;
    scene.add(grid);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(bound, 64),
      new THREE.MeshStandardMaterial({ color: 0x2a4a30, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;
    groundRef.current = ground;
    scene.add(ground);

    const accent = new THREE.Mesh(
      new THREE.CircleGeometry(bound * 0.42, 48),
      new THREE.MeshStandardMaterial({ color: 0x3d6b45, roughness: 1 }),
    );
    accent.rotation.x = -Math.PI / 2;
    accent.position.set(0, 0.02, -1);
    accent.receiveShadow = true;
    accentGroundRef.current = accent;
    scene.add(accent);

    const decor = new THREE.Group();
    decorRef.current = decor;
    scene.add(decor);

    const entities = new THREE.Group();
    entitiesRef.current = entities;
    scene.add(entities);

    const player = buildPlayerAvatar(0x6c5ce7);
    player.position.set(0, 0, 4);
    playerRef.current = player;
    scene.add(player);

    const playerLight = new THREE.PointLight(0xffd9a0, 0, 14);
    playerLight.position.set(0, 2.2, 0);
    playerLightRef.current = playerLight;
    scene.add(playerLight);

    const onPointerDown = () => {
      playFocusedRef.current = true;
      container.focus({ preventScroll: true });
    };
    const onFocus = () => {
      playFocusedRef.current = true;
    };
    const onBlur = () => {
      playFocusedRef.current = false;
      keysRef.current.clear();
    };
    container.addEventListener("pointerdown", onPointerDown);
    container.addEventListener("focus", onFocus);
    container.addEventListener("blur", onBlur);

    const tryCollectNear = () => {
      const near = nearEntityRef.current;
      if (!near) return;
      const data = near.userData as EntityUserData;
      if (!data.interactive || data.collected) return;
      data.collected = true;
      collectedRef.current.add(data.entityId);
      near.visible = false;
      if (lootElRef.current) {
        lootElRef.current.textContent = `Loot: ${collectedRef.current.size}`;
      }
      if (hintElRef.current) {
        hintElRef.current.hidden = false;
        hintElRef.current.textContent = `Collected: ${data.name}`;
        window.setTimeout(() => {
          if (hintElRef.current?.textContent?.startsWith("Collected")) {
            hintElRef.current.hidden = true;
          }
        }, 1400);
      }
    };

    const updateProximityHint = (
      player: THREE.Group | null,
      children: THREE.Object3D[],
    ) => {
      if (!player || !hintElRef.current) return;
      let best: THREE.Object3D | null = null;
      let bestDist = 2.1;
      for (const child of children) {
        const data = child.userData as EntityUserData;
        if (!data.interactive || data.collected || !child.visible) continue;
        const dist = Math.hypot(
          child.position.x - player.position.x,
          child.position.z - player.position.z,
        );
        if (dist < bestDist) {
          bestDist = dist;
          best = child;
        }
      }
      nearEntityRef.current = best;
      if (best) {
        const data = best.userData as EntityUserData;
        hintElRef.current.hidden = false;
        hintElRef.current.textContent = `[E] ${data.hint ?? data.name}`;
      } else if (!hintElRef.current.textContent?.startsWith("Collected")) {
        hintElRef.current.hidden = true;
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // Never steal keys while the user is composing a chat message.
      if (isTypingTarget(e.target) || !playFocusedRef.current) return;
      if (e.code in MOVE_KEYS) {
        e.preventDefault();
        keysRef.current.add(e.code);
      }
      if (e.code === "KeyE") {
        e.preventDefault();
        tryCollectNear();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.code);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    let raf = 0;
    const clock = new THREE.Clock();
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const t = clock.elapsedTime;

      for (const child of entities.children) {
        applyEntityMotion(child, t, delta);
      }

      let dx = 0;
      let dz = 0;
      for (const code of keysRef.current) {
        const move = MOVE_KEYS[code];
        if (move) {
          dx += move[0];
          dz += move[1];
        }
      }
      const moving = dx !== 0 || dz !== 0;
      const bound = boundRef.current;
      if (moving && playerRef.current) {
        const len = Math.hypot(dx, dz);
        const step = (speedRef.current * delta) / len;
        const nextX = THREE.MathUtils.clamp(playerRef.current.position.x + dx * step, -bound, bound);
        const nextZ = THREE.MathUtils.clamp(playerRef.current.position.z + dz * step, -bound, bound);
        if (!collides(nextX, nextZ, entities.children, 0.55)) {
          playerRef.current.position.x = nextX;
          playerRef.current.position.z = nextZ;
          playerRef.current.rotation.y = Math.atan2(dx, dz);
        }
      }

      const anims = playerAnimsRef.current;
      if (anims && playerRef.current) {
        const clip = moving ? anims.walk : anims.idle;
        const sampled = sampleClip(clip, t);
        playerRef.current.position.y = playerBaseYRef.current + (sampled["position.y"] ?? 0);
        playerRef.current.scale.y = sampled["scale.y"] ?? 1;
      }
      if (playerRef.current && playerLightRef.current) {
        playerLightRef.current.position.set(
          playerRef.current.position.x,
          2.4,
          playerRef.current.position.z,
        );
      }

      updateProximityHint(playerRef.current, entities.children);

      // Soft camera follow toward the player without fighting orbit drag hard.
      if (playerRef.current) {
        const target = controls.target;
        target.x += (playerRef.current.position.x - target.x) * 0.03;
        target.z += (playerRef.current.position.z - 1.5 - target.z) * 0.03;
      }

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      if (!container.clientWidth || !container.clientHeight) return;
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
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("focus", onFocus);
      container.removeEventListener("blur", onBlur);
      observer.disconnect();
      controls.dispose();
      renderer.dispose();
      hint.remove();
      loot.remove();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
      sceneRef.current = null;
    };
  }, []);

  const setBlueprint = useCallback((blueprint: GameBlueprint) => {
    const scene = sceneRef.current;
    const group = entitiesRef.current;
    const player = playerRef.current;
    if (!scene || !group || !player) return;

    const bound = blueprint.environment.worldRadius ?? DEFAULT_BOUND;
    boundRef.current = bound;

    applyEnvironment(scene, blueprint.environment, {
      ambient: ambientRef.current,
      sun: sunRef.current,
      playerLight: playerLightRef.current,
      ground: groundRef.current,
      accent: accentGroundRef.current,
      decor: decorRef.current,
      bound,
      replaceGrid: (next) => {
        if (gridRef.current) scene.remove(gridRef.current);
        gridRef.current = next;
        scene.add(next);
      },
    });

    for (const child of [...group.children]) {
      group.remove(child);
      disposeObject3D(child);
    }

    for (const entity of blueprint.entities) {
      const root = buildAssetMesh(entity.spec);
      // Prefab parts already sit on the ground; keep y at terrain level.
      root.position.set(entity.position.x, 0, entity.position.z);
      if (entity.rotationY) root.rotation.y = entity.rotationY;
      const footprint =
        (root.userData.footprint as number | undefined) ??
        Math.max(entity.spec.size.x, entity.spec.size.z, 0.8) * 0.45;
      root.userData = {
        behavior: entity.behavior,
        baseX: entity.position.x,
        baseY: 0,
        baseZ: entity.position.z,
        baseScaleY: 1,
        phase: hashPhase(entity.id),
        animation: entity.animation,
        interactive: entity.interactive,
        collected: collectedRef.current.has(entity.id),
        entityId: entity.id,
        name: entity.name,
        hint: entity.interactHint,
        footprint,
      } satisfies EntityUserData;
      if (root.userData.collected) root.visible = false;
      group.add(root);
    }

    speedRef.current = blueprint.player.speed;
    playerAnimsRef.current = blueprint.player.animations;
    playerBaseYRef.current = blueprint.player.spawn.y;
    tintPlayer(player, blueprint.player.color);

    const gameKey = `${blueprint.gameTitle}:${blueprint.createdAt}`;
    if (activeGameKeyRef.current !== gameKey) {
      activeGameKeyRef.current = gameKey;
      collectedRef.current.clear();
      if (lootElRef.current) lootElRef.current.textContent = "Loot: 0";
      player.position.set(
        blueprint.player.spawn.x,
        blueprint.player.spawn.y,
        blueprint.player.spawn.z,
      );
    }
  }, []);

  return { containerRef: containerRef as React.RefObject<HTMLDivElement>, setBlueprint };
}

function buildPlayerAvatar(color: number): THREE.Group {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.32, 0.55, 4, 10),
    new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.1 }),
  );
  body.position.y = 0.7;
  body.castShadow = true;
  group.add(body);

  const pack = new THREE.Mesh(
    new THREE.BoxGeometry(0.35, 0.35, 0.18),
    new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 0.9 }),
  );
  pack.position.set(0, 0.75, -0.28);
  pack.castShadow = true;
  group.add(pack);

  return group;
}

function tintPlayer(player: THREE.Group, color: string): void {
  const body = player.children[0] as THREE.Mesh | undefined;
  if (body?.material) {
    (body.material as THREE.MeshStandardMaterial).color.set(color);
  }
}

function collides(
  x: number,
  z: number,
  children: THREE.Object3D[],
  playerRadius: number,
): boolean {
  for (const child of children) {
    const data = child.userData as EntityUserData;
    if (!child.visible || data.collected) continue;
    // Path stones and flat moss shouldn't block movement.
    if (data.behavior === "bob" && data.footprint < 0.9) continue;
    if (data.footprint < 0.7) continue;
    const dist = Math.hypot(child.position.x - x, child.position.z - z);
    if (dist < playerRadius + data.footprint * 0.55) return true;
  }
  return false;
}

/** Stable phase from entity id so rebuilds don't reshuffle animation offsets. */
function hashPhase(id: string): number {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return (hash % 628) / 100;
}

function applyEntityMotion(child: THREE.Object3D, t: number, delta: number): void {
  const data = child.userData as EntityUserData;
  if (data.collected) return;

  if (data.animation) {
    const sampled = sampleClip(data.animation, t + data.phase);
    child.position.x = data.baseX + (sampled["position.x"] ?? 0);
    child.position.y = data.baseY + (sampled["position.y"] ?? 0);
    child.position.z = data.baseZ;
    if (sampled["rotation.y"] !== undefined) child.rotation.y = sampled["rotation.y"];
    child.scale.y = sampled["scale.y"] ?? data.baseScaleY;
    return;
  }

  switch (data.behavior) {
    case "spin":
      child.rotation.y += delta * 0.8;
      break;
    case "bob":
      child.position.y = data.baseY + Math.sin(t * 2 + data.phase) * 0.2;
      break;
    case "patrol":
      child.position.x = data.baseX + Math.sin(t + data.phase) * 2;
      break;
    case "pulse":
      child.scale.y = 1 + Math.sin(t * 3 + data.phase) * 0.08;
      break;
    case "static":
      break;
    default: {
      const _never: never = data.behavior;
      return _never;
    }
  }
}

interface SceneLights {
  ambient: THREE.AmbientLight | null;
  sun: THREE.DirectionalLight | null;
  playerLight: THREE.PointLight | null;
  ground: THREE.Mesh | null;
  accent: THREE.Mesh | null;
  decor: THREE.Group | null;
  bound: number;
  replaceGrid: (grid: THREE.GridHelper) => void;
}

function applyEnvironment(
  scene: THREE.Scene,
  env: GameBlueprint["environment"],
  lights: SceneLights,
): void {
  (scene.background as THREE.Color).set(env.skyColor);
  scene.fog = env.fog
    ? new THREE.Fog(env.skyColor, Math.max(12, lights.bound * 0.7), lights.bound * 2.2)
    : new THREE.Fog(env.skyColor, lights.bound * 1.6, lights.bound * 2.8);

  if (lights.ground) {
    (lights.ground.material as THREE.MeshStandardMaterial).color.set(env.groundColor);
    lights.ground.geometry.dispose();
    lights.ground.geometry = new THREE.CircleGeometry(lights.bound, 64);
  }
  if (lights.accent) {
    const accentColor = env.accentGroundColor ?? env.groundColor;
    (lights.accent.material as THREE.MeshStandardMaterial).color.set(accentColor);
    lights.accent.geometry.dispose();
    lights.accent.geometry = new THREE.CircleGeometry(lights.bound * 0.42, 48);
  }

  const grid = new THREE.GridHelper(
    lights.bound * 2,
    Math.max(12, Math.floor(lights.bound)),
    0x4a7a55,
    0x2f5538,
  );
  grid.position.y = 0.015;
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = env.lighting === "night" ? 0.15 : 0.28;
  lights.replaceGrid(grid);

  if (lights.decor) {
    rebuildDecor(lights.decor, env, lights.bound);
  }

  const settings = lightingSettings(env.lighting);
  if (lights.ambient) lights.ambient.intensity = settings.ambient;
  if (lights.sun) {
    lights.sun.intensity = settings.sun;
    lights.sun.color.set(settings.sunColor);
  }
  if (lights.playerLight) lights.playerLight.intensity = settings.playerLight;
}

function rebuildDecor(
  decor: THREE.Group,
  env: GameBlueprint["environment"],
  bound: number,
): void {
  for (const child of [...decor.children]) {
    decor.remove(child);
    disposeObject3D(child);
  }

  // Soft canopy disks at the forest edge for depth (theme-agnostic, tinted by ground).
  const canopyColor = new THREE.Color(env.accentGroundColor ?? env.groundColor).offsetHSL(0, 0.05, -0.08);
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const radius = bound * 0.92;
    const disk = new THREE.Mesh(
      new THREE.CircleGeometry(2.2 + (i % 3) * 0.4, 16),
      new THREE.MeshStandardMaterial({
        color: canopyColor,
        roughness: 1,
        transparent: true,
        opacity: 0.35,
      }),
    );
    disk.rotation.x = -Math.PI / 2;
    disk.position.set(Math.cos(angle) * radius, 0.04, Math.sin(angle) * radius - 1);
    decor.add(disk);
  }
}

function lightingSettings(mood: LightingMood): {
  ambient: number;
  sun: number;
  sunColor: string;
  playerLight: number;
} {
  switch (mood) {
    case "day":
      return { ambient: 0.72, sun: 1.2, sunColor: "#fff1d6", playerLight: 0 };
    case "dusk":
      return { ambient: 0.48, sun: 0.85, sunColor: "#ffb26b", playerLight: 0.35 };
    case "night":
      return { ambient: 0.26, sun: 0.32, sunColor: "#9db4ff", playerLight: 1.0 };
    case "cave":
      return { ambient: 0.16, sun: 0.15, sunColor: "#6673aa", playerLight: 1.4 };
    default: {
      const _never: never = mood;
      return _never;
    }
  }
}
