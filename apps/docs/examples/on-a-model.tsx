import { useAnimations, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Afterburner } from "@aeronautic/afterburner/react";
import { type FC, useEffect, useRef } from "react";
import { type Group, LoopOnce } from "three";
import { base_path } from "@/lib/shared";
import { Stage } from "./stage";

// A glTF exported from Blender. Each nozzle has an empty node on its exit,
// FX_Exhaust_L and FX_Exhaust_R, riding its vectoring gimbal with its -Z
// pointing aft: those are what the plumes sit on, from outside the model's tree
const MODEL = `${base_path}/fighter.glb`;

/**
 * A twin-engined fighter flying a lazy figure of eight, burners lit.
 * @returns The model and its two plumes
 */
const Fighter: FC = () => {
  const { scene, nodes, animations } = useGLTF(MODEL);
  const body = useRef<Group>(null);
  const { actions } = useAnimations(animations, body);

  useEffect(() => {
    // The afterburner cones and the pylons are meant hidden, flagged so in
    // their extras, which three hands over as userData
    scene.traverse((node) => {
      if (node.userData.visible_default === false) node.visible = false;
    });

    // It's modelled on its wheels: fold them away once it's on screen
    const retract = actions.ANIM_Gear_Retract;

    if (!retract) return;

    retract.setLoop(LoopOnce, 1);
    retract.clampWhenFinished = true;
    retract.play();
  }, [scene, actions]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 0.5;

    if (!body.current) return;

    body.current.rotation.set(
      Math.sin(t * 0.5) * 0.2,
      Math.sin(t) * 0.25,
      Math.sin(t) * 0.5,
    );
    body.current.position.y = Math.sin(t * 1.3) * 0.6;
  });

  return (
    <group ref={body}>
      <primitive object={scene} />
      {[nodes.FX_Exhaust_L, nodes.FX_Exhaust_R].map((exhaust, index) => (
        <Afterburner
          key={index}
          target={exhaust}
          preset="afterburner"
          // At the petals' trailing edge, in the anchor's frame
          position={[0, 0, 0.08]}
          // The exhaust streams down the anchor's -Z: aft
          direction={[0, 0, -1]}
          // The exit as modelled, inside the petals: an oval 0.76 m wide and 0.45 m high, sized
          // as the round exit of its area
          params={{ nozzleRadiusM: 0.29, nozzleAspect: 1.67 }}
        />
      ))}
    </group>
  );
};

/**
 * Two plumes on two nodes of a loaded, moving model, placed with `target`.
 * @returns The example
 */
export const OnAModel: FC = () => (
  <Stage camera={[17, 6, 24]} target={[0, 0, 9]} floor={-5} reflections>
    <Fighter />
  </Stage>
);

export default OnAModel;
