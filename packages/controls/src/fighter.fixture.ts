import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type AnimationClip, MeshBasicMaterial, type Object3D } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

// The docs' fighter, loaded in Node for the rig's tests: its nodes, meshes
// and clips, none of its textures

const MODEL = fileURLToPath(
  new URL("../../../apps/docs/public/fighter.glb", import.meta.url),
);

/**
 * Load the fighter.
 * @returns Its scene and its clips
 */
export const load_fighter = async (): Promise<{
  scene: Object3D;
  animations: AnimationClip[];
}> => {
  const buffer = readFileSync(MODEL);
  const loader = new GLTFLoader();

  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.register(() => ({
    name: "no_materials",
    loadMaterial: () => Promise.resolve(new MeshBasicMaterial()),
  }));

  return new Promise((resolve, reject) =>
    loader.parse(
      buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength,
      ),
      "",
      (gltf) => resolve({ scene: gltf.scene, animations: gltf.animations }),
      reject,
    ),
  );
};
