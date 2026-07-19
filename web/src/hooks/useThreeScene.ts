import { useCallback, useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { AssetSpec } from "@ai-gamedev/shared";
import { buildAssetMesh } from "../lib/three-helpers.js";

interface ThreeScene {
  containerRef: React.RefObject<HTMLDivElement>;
  /** Adds a generated asset to the scene, laid out on a grid. */
  addAsset: (spec: AssetSpec) => void;
  clear: () => void;
}

/**
 * Encapsulates all imperative Three.js lifecycle (renderer, camera, lights,
 * animation loop, resize handling) behind a small React-friendly API.
 */
export function useThreeScene(): ThreeScene {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const assetsRef = useRef<THREE.Mesh[]>([]);

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
    camera.position.set(4, 4, 6);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(5, 8, 5);
    key.castShadow = true;
    scene.add(key);

    const grid = new THREE.GridHelper(20, 20, 0x3a3f55, 0x24283b);
    scene.add(grid);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 20),
      new THREE.MeshStandardMaterial({ color: 0x1b1e2b, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.001;
    ground.receiveShadow = true;
    scene.add(ground);

    let raf = 0;
    const clock = new THREE.Clock();
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      for (const mesh of assetsRef.current) mesh.rotation.y += delta * 0.4;
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
      observer.disconnect();
      controls.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
      assetsRef.current = [];
      sceneRef.current = null;
    };
  }, []);

  const addAsset = useCallback((spec: AssetSpec) => {
    const scene = sceneRef.current;
    if (!scene) return;
    const mesh = buildAssetMesh(spec);
    const index = assetsRef.current.length;
    // Simple spiral-ish grid layout so multiple assets don't overlap.
    const cols = 4;
    const gap = 2;
    mesh.position.set(
      ((index % cols) - (cols - 1) / 2) * gap,
      Math.max(spec.size.y, 0.5),
      Math.floor(index / cols) * gap,
    );
    scene.add(mesh);
    assetsRef.current.push(mesh);
  }, []);

  const clear = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    for (const mesh of assetsRef.current) {
      scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    assetsRef.current = [];
  }, []);

  return { containerRef, addAsset, clear };
}
