import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type Mesh, MeshBasicMaterial, type Object3D } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

// The docs' fighter, loaded in Node for the capture's tests: its meshes and
// nodes, none of its textures

const MODEL = fileURLToPath(
  new URL("../../../apps/docs/public/fighter.glb", import.meta.url),
);

// Not the shape the air flies round: the gear, its doors and bays, and the
// pylons, all hanging below the aircraft in its rest pose
const NOT_THE_SHAPE =
  /^(GEAR_|DOOR_|HINGE_Gear|CTRL_Gear|HINGE_Door|CTRL_Door|PYLON_|LIB_Pylon|BAY_|GEAR)/;

/**
 * Load the fighter.
 * @returns Its scene
 */
export const load_fighter = async (): Promise<Object3D> => {
  const buffer = readFileSync(MODEL);
  const loader = new GLTFLoader();

  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.register(() => ({
    name: "no_materials",
    loadMaterial: () => Promise.resolve(new MeshBasicMaterial()),
  }));

  const gltf = await new Promise<{ scene: Object3D }>((resolve, reject) =>
    loader.parse(
      buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength,
      ),
      "",
      resolve,
      reject,
    ),
  );

  // Hidden in its extras, as the docs hide them
  gltf.scene.traverse((node) => {
    if (node.userData.visible_default === false) node.visible = false;
  });

  return gltf.scene;
};

/**
 * Whether a mesh is part of the airframe the air flies round.
 * @param mesh The mesh
 * @returns Whether to keep it
 */
export const fighter_filter = (mesh: Mesh): boolean => {
  for (let node: Object3D | null = mesh; node; node = node.parent) {
    if (!node.visible || NOT_THE_SHAPE.test(node.name)) {
      return false;
    }
  }

  return true;
};
