import { useCallback, useEffect, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  actionAxis,
  buildPrefab,
  controlProfileFor,
  createSessionState,
  formatSessionHud,
  isActionDown,
  profileKeyCodes,
  sampleClip,
  sampleTerrainHeight,
  sessionOnCheckpoint,
  sessionOnCollect,
  sessionOnFire,
  sessionOnReach,
  sessionOnReload,
  tickSession,
  type AnimationClip,
  type ControlProfile,
  type EntityBehavior,
  type GameBlueprint,
  type GameRuntimeSpec,
  type GameSessionState,
  type LightingMood,
  type TerrainSpec,
} from "@ai-gamedev/shared";
import { loadGltfClone } from "../lib/gltfCache.js";
import { buildAssetMesh, disposeObject3D } from "../lib/three-helpers.js";
import { buildTerrainMesh } from "../lib/terrainMesh.js";

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

const DEFAULT_BOUND = 18;
const DEFAULT_CONTROLS = controlProfileFor("walk");

/** True when the user is typing in an input/textarea/contenteditable. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

/**
 * Owns the imperative Three.js runtime and renders a {@link GameBlueprint} as a
 * cinematic playable scene: terrain, detailed prefabs, walk/drive controls,
 * and proximity collectibles (press E).
 */
export function useThreeScene(): ThreeScene {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
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
  const avatarModeRef = useRef<"capsule" | "car">("capsule");
  const velocityRef = useRef(0);
  const turnSpeedRef = useRef(2.4);
  const accelRef = useRef(22);
  const terrainRef = useRef<TerrainSpec | null>(null);
  const checkpointsHitRef = useRef<Set<string>>(new Set());
  const controlProfileRef = useRef<ControlProfile>(DEFAULT_CONTROLS);
  const controlCodesRef = useRef<Set<string>>(profileKeyCodes(DEFAULT_CONTROLS));
  const projectilesRef = useRef<THREE.Group | null>(null);
  const fireCooldownRef = useRef(0);
  const verticalVelRef = useRef(0);
  const jumpOffsetRef = useRef(0);
  const crouchingRef = useRef(false);
  const runtimeRef = useRef<GameRuntimeSpec | null>(null);
  const sessionRef = useRef<GameSessionState | null>(null);
  /** Bumps on each setBlueprint so in-flight GLTF loads can be ignored. */
  const blueprintEpochRef = useRef(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.tabIndex = 0;
    container.setAttribute("role", "application");
    container.setAttribute(
      "aria-label",
      "Game preview. Click to focus, then use the on-screen control scheme for this game.",
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
      280,
    );
    camera.position.set(10, 12, 16);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 1.2, -2);
    controls.maxPolarAngle = Math.PI * 0.48;
    controlsRef.current = controls;

    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    ambientRef.current = ambient;
    scene.add(ambient);

    const hemi = new THREE.HemisphereLight(0xb8e0ff, 0x3d6b45, 0.45);
    scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff2d6, 1.15);
    sun.position.set(10, 18, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 90;
    sun.shadow.camera.left = -45;
    sun.shadow.camera.right = 45;
    sun.shadow.camera.top = 45;
    sun.shadow.camera.bottom = -45;
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

    const projectiles = new THREE.Group();
    projectilesRef.current = projectiles;
    scene.add(projectiles);

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

    const syncHud = () => {
      if (!lootElRef.current || !sessionRef.current || !runtimeRef.current) return;
      const session = sessionRef.current;
      if (session.status === "won" || session.status === "lost") {
        lootElRef.current.textContent = `${session.status.toUpperCase()} · ${session.message}`;
        return;
      }
      lootElRef.current.textContent = formatSessionHud(session, runtimeRef.current);
    };

    const tryCollectNear = () => {
      const near = nearEntityRef.current;
      if (!near) return;
      const data = near.userData as EntityUserData;
      if (!data.interactive || data.collected) return;
      data.collected = true;
      collectedRef.current.add(data.entityId);
      near.visible = false;
      if (sessionRef.current && runtimeRef.current) {
        const isLandmark = /arch|well|statue|gate|pad/i.test(data.name);
        sessionRef.current = isLandmark
          ? sessionOnReach(sessionRef.current, runtimeRef.current)
          : sessionOnCollect(sessionRef.current, runtimeRef.current);
        syncHud();
      }
      if (hintElRef.current) {
        hintElRef.current.hidden = false;
        hintElRef.current.textContent = sessionRef.current?.message ?? `Collected: ${data.name}`;
        window.setTimeout(() => {
          if (hintElRef.current && !hintElRef.current.textContent?.startsWith("[")) {
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
        const interactLabel =
          controlProfileRef.current.bindings.find((b) => b.action === "interact")?.label ?? "E";
        hintElRef.current.hidden = false;
        hintElRef.current.textContent = `[${interactLabel}] ${data.hint ?? data.name}`;
      } else if (!hintElRef.current.textContent?.startsWith("Collected")) {
        hintElRef.current.hidden = true;
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // Never steal keys while the user is composing a chat message.
      if (isTypingTarget(e.target) || !playFocusedRef.current) return;
      if (controlCodesRef.current.has(e.code)) {
        e.preventDefault();
        keysRef.current.add(e.code);
      }
      const profile = controlProfileRef.current;
      if (isActionDown(profile, "interact", new Set([e.code]))) {
        e.preventDefault();
        tryCollectNear();
      }
      if (
        runtimeRef.current?.features.reload &&
        isActionDown(profile, "reload", new Set([e.code])) &&
        sessionRef.current &&
        runtimeRef.current
      ) {
        e.preventDefault();
        sessionRef.current = sessionOnReload(sessionRef.current, runtimeRef.current);
        syncHud();
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
      const profile = controlProfileRef.current;
      const keys = keysRef.current;

      for (const child of entities.children) {
        applyEntityMotion(child, t, delta);
      }
      stepProjectiles(projectiles, delta);

      if (sessionRef.current && runtimeRef.current && sessionRef.current.status === "playing") {
        sessionRef.current = tickSession(sessionRef.current, runtimeRef.current, delta);
        if (t % 0.25 < delta) syncHud();
      }

      const bound = boundRef.current;
      let moving = false;
      if (playerRef.current) {
        const scheme = profile.scheme;
        if (scheme === "drive" || avatarModeRef.current === "car") {
          moving = stepDrive(
            playerRef.current,
            profile,
            keys,
            delta,
            bound,
            entities.children,
            velocityRef,
            turnSpeedRef,
            accelRef,
            speedRef,
          );
        } else if (scheme === "fly") {
          moving = stepFly(playerRef.current, profile, keys, delta, bound, speedRef);
        } else {
          // walk / fps / twin_stick share locomotion; fps adds fire/reload/crouch.
          const sprint = isActionDown(profile, "sprint", keys);
          crouchingRef.current = isActionDown(profile, "crouch", keys);
          const axisX = actionAxis(profile, "moveRight", "moveLeft", keys);
          const axisZ = actionAxis(profile, "moveBack", "moveForward", keys);
          moving = axisX !== 0 || axisZ !== 0;
          if (moving) {
            const len = Math.hypot(axisX, axisZ);
            const mul = (sprint ? 1.55 : 1) * (crouchingRef.current ? 0.55 : 1);
            const step = (speedRef.current * mul * delta) / len;
            const nextX = THREE.MathUtils.clamp(
              playerRef.current.position.x + axisX * step,
              -bound,
              bound,
            );
            const nextZ = THREE.MathUtils.clamp(
              playerRef.current.position.z + axisZ * step,
              -bound,
              bound,
            );
            if (!collides(nextX, nextZ, entities.children, 0.55)) {
              playerRef.current.position.x = nextX;
              playerRef.current.position.z = nextZ;
              playerRef.current.rotation.y = Math.atan2(axisX, axisZ);
            }
          }

          if (isActionDown(profile, "jump", keys) && jumpOffsetRef.current === 0) {
            verticalVelRef.current = 5.5;
          }

          if (scheme === "fps" || scheme === "twin_stick") {
            fireCooldownRef.current = Math.max(0, fireCooldownRef.current - delta);
            const cooldown = runtimeRef.current?.combat?.fireCooldownSec ?? 0.18;
            if (isActionDown(profile, "fire", keys) && fireCooldownRef.current <= 0) {
              if (sessionRef.current && runtimeRef.current) {
                const before = sessionRef.current.ammo;
                sessionRef.current = sessionOnFire(sessionRef.current, runtimeRef.current);
                if (sessionRef.current.ammo < before || sessionRef.current.message === "Fire!") {
                  spawnProjectile(projectiles, playerRef.current);
                }
                syncHud();
              } else {
                spawnProjectile(projectiles, playerRef.current);
              }
              fireCooldownRef.current = cooldown;
            }
          }
        }

        const groundY = terrainHeightAt(
          playerRef.current.position.x,
          playerRef.current.position.z,
          terrainRef.current,
          bound,
        );

        if (avatarModeRef.current !== "car" && profile.scheme !== "fly") {
          verticalVelRef.current -= 18 * delta;
          jumpOffsetRef.current += verticalVelRef.current * delta;
          if (jumpOffsetRef.current < 0) {
            jumpOffsetRef.current = 0;
            verticalVelRef.current = 0;
          }
        }

        const anims = playerAnimsRef.current;
        const crouchScale = crouchingRef.current ? 0.72 : 1;
        const standY = playerBaseYRef.current;
        if (anims && avatarModeRef.current === "capsule" && profile.scheme !== "fly") {
          const clip = moving ? anims.walk : anims.idle;
          const sampled = sampleClip(clip, t);
          playerRef.current.position.y =
            groundY + standY + jumpOffsetRef.current + (sampled["position.y"] ?? 0);
          playerRef.current.scale.y = (sampled["scale.y"] ?? 1) * crouchScale;
        } else if (profile.scheme === "fly") {
          // fly mode keeps absolute Y from stepFly
        } else {
          playerRef.current.position.y =
            groundY + (avatarModeRef.current === "car" ? 0.05 : standY + jumpOffsetRef.current);
          playerRef.current.scale.y = crouchScale;
        }

        if (playerLightRef.current) {
          playerLightRef.current.position.set(
            playerRef.current.position.x,
            playerRef.current.position.y + 2,
            playerRef.current.position.z,
          );
        }

        // Soft camera follow — tighter chase for racing / fps.
        const chase = profile.scheme === "drive" || profile.scheme === "fps";
        const follow = chase ? 0.08 : 0.03;
        const target = controls.target;
        target.x += (playerRef.current.position.x - target.x) * follow;
        target.y += (playerRef.current.position.y + 1.2 - target.y) * follow;
        target.z +=
          (playerRef.current.position.z - (chase ? 0 : 1.5) - target.z) * follow;
        if (chase && cameraRef.current) {
          const yaw = playerRef.current.rotation.y;
          const back = profile.scheme === "drive" ? 8 : 6;
          const height = profile.scheme === "drive" ? 4.5 : 3.2;
          const desired = new THREE.Vector3(
            playerRef.current.position.x + Math.sin(yaw) * back,
            playerRef.current.position.y + height,
            playerRef.current.position.z + Math.cos(yaw) * back,
          );
          cameraRef.current.position.lerp(desired, 0.06);
        }
      }

      updateProximityHint(playerRef.current, entities.children);
      updateCheckpointProgress(
        playerRef.current,
        entities.children,
        profile.scheme,
        checkpointsHitRef,
        (id) => {
          if (sessionRef.current && runtimeRef.current) {
            sessionRef.current = sessionOnCheckpoint(
              sessionRef.current,
              runtimeRef.current,
              id,
            );
            syncHud();
          }
        },
      );

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

    const epoch = ++blueprintEpochRef.current;
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
      // Group host so we can swap procedural placeholders for kit/Blender GLBs.
      const root = new THREE.Group();
      const placeholder = buildAssetMesh(entity.spec);
      root.add(placeholder);
      const baseY = entity.position.y ?? 0;
      root.position.set(entity.position.x, baseY, entity.position.z);
      if (entity.rotationY) root.rotation.y = entity.rotationY;
      const footprint =
        (placeholder.userData.footprint as number | undefined) ??
        Math.max(entity.spec.size.x, entity.spec.size.z, 0.8) * 0.45;
      root.userData = {
        behavior: entity.behavior,
        baseX: entity.position.x,
        baseY,
        baseZ: entity.position.z,
        baseScaleY: 1,
        phase: hashPhase(entity.id),
        animation: entity.animation,
        interactive: entity.interactive,
        collected:
          collectedRef.current.has(entity.id) ||
          checkpointsHitRef.current.has(entity.id),
        entityId: entity.id,
        name: entity.name,
        hint: entity.interactHint,
        footprint,
      } satisfies EntityUserData;
      if (root.userData.collected && entity.role === "loot") root.visible = false;
      group.add(root);

      if (entity.modelUrl) {
        const url = entity.modelUrl;
        void loadGltfClone(url)
          .then((mesh) => {
            if (blueprintEpochRef.current !== epoch || !root.parent) {
              disposeObject3D(mesh);
              return;
            }
            for (const child of [...root.children]) {
              root.remove(child);
              disposeObject3D(child);
            }
            root.add(mesh);
            const fp = mesh.userData.footprint as number | undefined;
            if (fp) root.userData.footprint = fp;
          })
          .catch(() => {
            // Keep procedural placeholder if the GLB fails to load.
          });
      }
    }

    speedRef.current = blueprint.player.speed;
    playerAnimsRef.current = blueprint.player.animations;
    playerBaseYRef.current = blueprint.player.spawn.y;
    turnSpeedRef.current = blueprint.player.turnSpeed ?? 2.4;
    accelRef.current = blueprint.player.acceleration ?? 22;
    terrainRef.current = blueprint.environment.terrain ?? null;

    const profile =
      blueprint.controls ??
      controlProfileFor(blueprint.design?.systems.controlScheme ?? "walk");
    controlProfileRef.current = profile;
    controlCodesRef.current = profileKeyCodes(profile);
    runtimeRef.current = blueprint.runtime ?? null;

    const nextAvatar =
      profile.scheme === "drive" ? "car" : (blueprint.player.avatar ?? "capsule");
    if (avatarModeRef.current !== nextAvatar) {
      rebuildPlayerAvatar(player, nextAvatar, blueprint.player.color);
      avatarModeRef.current = nextAvatar;
    } else {
      tintPlayer(player, blueprint.player.color);
    }

    // Rebuild cinematic terrain mesh when recipe changes.
    rebuildGroundFromBlueprint(scene, blueprint, groundRef, accentGroundRef);

    const gameKey = `${blueprint.gameTitle}:${blueprint.createdAt}`;
    if (activeGameKeyRef.current !== gameKey) {
      activeGameKeyRef.current = gameKey;
      collectedRef.current.clear();
      checkpointsHitRef.current.clear();
      velocityRef.current = 0;
      verticalVelRef.current = 0;
      jumpOffsetRef.current = 0;
      fireCooldownRef.current = 0;
      if (blueprint.runtime) {
        sessionRef.current = createSessionState(blueprint.runtime);
        if (lootElRef.current) {
          lootElRef.current.textContent = formatSessionHud(
            sessionRef.current,
            blueprint.runtime,
          );
        }
      } else {
        sessionRef.current = null;
      }
      if (projectilesRef.current) {
        for (const child of [...projectilesRef.current.children]) {
          projectilesRef.current.remove(child);
          disposeObject3D(child);
        }
      }
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

function rebuildPlayerAvatar(
  player: THREE.Group,
  mode: "capsule" | "car",
  color: string,
): void {
  for (const child of [...player.children]) {
    player.remove(child);
    disposeObject3D(child);
  }
  if (mode === "car") {
    const car = buildAssetMesh(buildPrefab("race_car").parts ? {
      shape: "box",
      color,
      size: buildPrefab("race_car").size,
      roughness: 0.35,
      metalness: 0.55,
      prefab: "race_car",
      fidelity: "cinematic",
      parts: buildPrefab("race_car").parts.map((p, i) =>
        i === 0 ? { ...p, color } : p,
      ),
    } : {
      shape: "box",
      color,
      size: { x: 1.4, y: 0.8, z: 2.2 },
      roughness: 0.4,
      metalness: 0.5,
    });
    player.add(car);
    return;
  }
  const capsule = buildPlayerAvatar(new THREE.Color(color).getHex());
  for (const child of [...capsule.children]) {
    player.add(child);
  }
}

function tintPlayer(player: THREE.Group, color: string): void {
  player.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    if (mat?.color && !mat.emissiveIntensity) {
      // Tint primary body panels only.
      if (mesh.position.y > 0.2 && mesh.position.y < 0.9) {
        mat.color.set(color);
      }
    }
  });
}

function terrainHeightAt(
  x: number,
  z: number,
  terrain: TerrainSpec | null,
  worldRadius: number,
): number {
  if (!terrain) return 0;
  return sampleTerrainHeight(x, z, terrain, worldRadius);
}

function stepDrive(
  player: THREE.Group,
  profile: ControlProfile,
  keys: ReadonlySet<string>,
  delta: number,
  bound: number,
  obstacles: THREE.Object3D[],
  velocity: MutableRefObject<number>,
  turnSpeed: MutableRefObject<number>,
  accel: MutableRefObject<number>,
  speed: MutableRefObject<number>,
): boolean {
  const throttle = actionAxis(profile, "accelerate", "brake", keys);
  const steer = actionAxis(profile, "steerRight", "steerLeft", keys);
  const handbrake = isActionDown(profile, "handbrake", keys);
  const boost = isActionDown(profile, "boost", keys);

  if (throttle !== 0) {
    const force = accel.current * (boost ? 1.45 : 1);
    velocity.current += throttle * force * delta;
  } else {
    velocity.current *= 1 - Math.min(1, delta * (handbrake ? 4.5 : 1.8));
  }
  if (handbrake) {
    velocity.current *= 1 - Math.min(1, delta * 3.2);
  }

  const maxSpeed = speed.current * (boost ? 1.35 : 1);
  velocity.current = THREE.MathUtils.clamp(velocity.current, -maxSpeed * 0.4, maxSpeed);

  const steerMul = handbrake ? 1.7 : 1;
  if (Math.abs(velocity.current) > 0.2) {
    player.rotation.y +=
      steer * turnSpeed.current * steerMul * delta * Math.sign(velocity.current || 1);
  }

  const yaw = player.rotation.y;
  const nextX = THREE.MathUtils.clamp(
    player.position.x + Math.sin(yaw) * -velocity.current * delta,
    -bound,
    bound,
  );
  const nextZ = THREE.MathUtils.clamp(
    player.position.z + Math.cos(yaw) * -velocity.current * delta,
    -bound,
    bound,
  );
  if (!collides(nextX, nextZ, obstacles, 0.9)) {
    player.position.x = nextX;
    player.position.z = nextZ;
  } else {
    velocity.current *= 0.3;
  }
  return Math.abs(velocity.current) > 0.15;
}

function stepFly(
  player: THREE.Group,
  profile: ControlProfile,
  keys: ReadonlySet<string>,
  delta: number,
  bound: number,
  speed: MutableRefObject<number>,
): boolean {
  const axisX = actionAxis(profile, "moveRight", "moveLeft", keys);
  const axisZ = actionAxis(profile, "moveBack", "moveForward", keys);
  const axisY =
    (isActionDown(profile, "jump", keys) ? 1 : 0) -
    (isActionDown(profile, "crouch", keys) ? 1 : 0);
  const boost = isActionDown(profile, "boost", keys) ? 1.6 : 1;
  const moving = axisX !== 0 || axisZ !== 0 || axisY !== 0;
  if (!moving) return false;
  const len = Math.hypot(axisX, axisZ, axisY) || 1;
  const step = (speed.current * boost * delta) / len;
  player.position.x = THREE.MathUtils.clamp(player.position.x + axisX * step, -bound, bound);
  player.position.z = THREE.MathUtils.clamp(player.position.z + axisZ * step, -bound, bound);
  player.position.y = THREE.MathUtils.clamp(player.position.y + axisY * step, 0.5, 18);
  if (axisX !== 0 || axisZ !== 0) {
    player.rotation.y = Math.atan2(axisX, axisZ);
  }
  return true;
}

function spawnProjectile(group: THREE.Group, player: THREE.Group): void {
  const bolt = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 10, 10),
    new THREE.MeshStandardMaterial({
      color: "#00e5ff",
      emissive: "#00e5ff",
      emissiveIntensity: 1.2,
    }),
  );
  const yaw = player.rotation.y;
  bolt.position.set(
    player.position.x - Math.sin(yaw) * 0.8,
    player.position.y + 0.9,
    player.position.z - Math.cos(yaw) * 0.8,
  );
  bolt.userData = {
    vx: -Math.sin(yaw) * 28,
    vz: -Math.cos(yaw) * 28,
    life: 1.2,
  };
  group.add(bolt);
}

function stepProjectiles(group: THREE.Group | null, delta: number): void {
  if (!group) return;
  for (const child of [...group.children]) {
    const data = child.userData as { vx: number; vz: number; life: number };
    child.position.x += data.vx * delta;
    child.position.z += data.vz * delta;
    data.life -= delta;
    if (data.life <= 0) {
      group.remove(child);
      disposeObject3D(child);
    }
  }
}

function updateCheckpointProgress(
  player: THREE.Group | null,
  children: THREE.Object3D[],
  scheme: ControlProfile["scheme"],
  checkpointsHit: MutableRefObject<Set<string>>,
  onHit: (entityId: string) => void,
): void {
  if (!player || scheme !== "drive") return;
  for (const child of children) {
    const data = child.userData as EntityUserData;
    if (!data.interactive || checkpointsHit.current.has(data.entityId)) continue;
    if (!/checkpoint/i.test(data.name) && !data.hint?.toLowerCase().includes("checkpoint")) {
      continue;
    }
    const dist = Math.hypot(child.position.x - player.position.x, child.position.z - player.position.z);
    if (dist < 3.2) {
      checkpointsHit.current.add(data.entityId);
      onHit(data.entityId);
    }
  }
}

function rebuildGroundFromBlueprint(
  scene: THREE.Scene,
  blueprint: GameBlueprint,
  ground: MutableRefObject<THREE.Mesh | null>,
  accent: MutableRefObject<THREE.Mesh | null>,
): void {
  const bound = blueprint.environment.worldRadius ?? DEFAULT_BOUND;
  const terrain = blueprint.environment.terrain;
  if (ground.current) {
    scene.remove(ground.current);
    disposeObject3D(ground.current);
    ground.current = null;
  }
  if (accent.current) {
    scene.remove(accent.current);
    disposeObject3D(accent.current);
    accent.current = null;
  }
  if (terrain) {
    const mesh = buildTerrainMesh(
      terrain,
      bound,
      blueprint.environment.groundColor,
      blueprint.environment.accentGroundColor ?? blueprint.environment.groundColor,
    );
    ground.current = mesh;
    scene.add(mesh);
  } else {
    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry(bound, 64),
      new THREE.MeshStandardMaterial({ color: blueprint.environment.groundColor, roughness: 1 }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = true;
    ground.current = mesh;
    scene.add(mesh);
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

  // Terrain geometry is rebuilt in setBlueprint; here we only sync fog/lights/sky.
  if (lights.ground?.material) {
    (lights.ground.material as THREE.MeshStandardMaterial).color.set(env.groundColor);
  }
  if (lights.accent?.material) {
    const accentColor = env.accentGroundColor ?? env.groundColor;
    (lights.accent.material as THREE.MeshStandardMaterial).color.set(accentColor);
  }

  if (env.postFx) {
    const fogNear = Math.max(10, lights.bound * (0.55 - env.postFx.fogDensity * 4));
    const fogFar = lights.bound * (2.4 - env.postFx.fogDensity * 8);
    scene.fog = new THREE.Fog(env.skyColor, fogNear, Math.max(fogNear + 8, fogFar));
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
