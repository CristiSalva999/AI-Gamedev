import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const loader = new GLTFLoader();
const cache = new Map<string, Promise<THREE.Object3D>>();

/**
 * Load a .glb/.gltf once per URL and return a cloned scene graph safe to
 * mutate (position/animation) per entity instance.
 */
export function loadGltfClone(url: string): Promise<THREE.Object3D> {
  let pending = cache.get(url);
  if (!pending) {
    pending = loader.loadAsync(url).then((gltf) => gltf.scene);
    cache.set(url, pending);
  }
  return pending.then((scene) => {
    const clone = scene.clone(true);
    clone.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    // Ground the model: shift so its bounding box sits on y=0.
    const box = new THREE.Box3().setFromObject(clone);
    if (Number.isFinite(box.min.y)) {
      clone.position.y -= box.min.y;
    }
    const size = new THREE.Vector3();
    box.getSize(size);
    clone.userData.footprint = Math.max(size.x, size.z, 0.8) * 0.45;
    return clone;
  });
}

/** Test helper. */
export function clearGltfCache(): void {
  cache.clear();
}
