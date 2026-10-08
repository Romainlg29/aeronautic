import {
  BufferGeometry,
  Float32BufferAttribute,
  Vector2,
  Vector3,
} from "three";
import {
  BackSide,
  CustomBlending,
  MeshBasicNodeMaterial,
  OneFactor,
  OneMinusSrcAlphaFactor,
  type Node,
  type UniformNode,
} from "three/webgpu";
import {
  create_scene_fog,
  scene_fog_factor,
  scene_view_z,
  type SceneBackdrop,
  type SceneFogUniforms,
} from "@aeronautic/core";
import {
  Discard,
  Fn,
  If,
  Loop,
  abs,
  atan,
  cameraPosition,
  dot,
  exp,
  float,
  fract,
  length,
  max,
  min,
  normalize,
  positionView,
  positionWorld,
  pow,
  screenCoordinate,
  screenUV,
  select,
  sqrt,
  tan,
  uniform,
  vec2,
  vec3,
  vec4,
} from "three/tsl";

// A beam's light in the air
//
// Each beam is drawn on its own cone, from the lamp out to where its light
// in the air stops showing. Each pixel the cone covers finds where its ray
// is inside the beam and sums the light the air scatters towards the eye
// along that stretch, stopping at the opaque scene. The lamp is near enough
// a point that its light falls off as 1/r² from it, so the samples are laid
// evenly in the angle the lamp sees them at: as many near it, where the
// light is, as far along

type F = Node<"float">;
type V2 = Node<"vec2">;
type V3 = Node<"vec3">;
type V4 = Node<"vec4">;

/** ln 10 */
const LN10 = Math.log(10);

/**
 * One beam's uniforms.
 */
export type BeamUniforms = {
  /** The lamp, in the world */
  origin: UniformNode<"vec3", Vector3>;

  /** Its axes in the world: across, up and along the beam */
  across: UniformNode<"vec3", Vector3>;
  up: UniformNode<"vec3", Vector3>;
  along: UniformNode<"vec3", Vector3>;

  /** The cone drawn: the tangents of its half-angles, and its length */
  tangents: UniformNode<"vec2", Vector2>;
  length: UniformNode<"float", number>;

  /** The Gaussian's: one over the spread's half-widths, in radians */
  inverse: UniformNode<"vec2", Vector2>;

  /** Its peak, coloured, in the scene's units: candela times the exposure */
  intensity: UniformNode<"vec3", Vector3>;

  /** The air's extinction per metre, red, green and blue */
  rayleigh: UniformNode<"vec3", Vector3>;
  aerosol: UniformNode<"vec3", Vector3>;

  /** The haze's single scattering albedo and asymmetry */
  albedo: UniformNode<"float", number>;
  asymmetry: UniformNode<"float", number>;

  /** The lamp's lens radius: its light starts from its face, not a point */
  lensM: UniformNode<"float", number>;

  /** The scene's fog, written every render */
  fog: SceneFogUniforms;
};

/**
 * Make one beam's uniforms.
 * @returns Fresh uniforms
 */
export const create_beam_uniforms = (): BeamUniforms => ({
  origin: uniform(new Vector3()) as UniformNode<"vec3", Vector3>,
  across: uniform(new Vector3(1, 0, 0)) as UniformNode<"vec3", Vector3>,
  up: uniform(new Vector3(0, 1, 0)) as UniformNode<"vec3", Vector3>,
  along: uniform(new Vector3(0, 0, 1)) as UniformNode<"vec3", Vector3>,
  tangents: uniform(new Vector2(0.1, 0.1)) as UniformNode<"vec2", Vector2>,
  length: uniform(1) as UniformNode<"float", number>,
  inverse: uniform(new Vector2(1, 1)) as UniformNode<"vec2", Vector2>,
  intensity: uniform(new Vector3()) as UniformNode<"vec3", Vector3>,
  rayleigh: uniform(new Vector3()) as UniformNode<"vec3", Vector3>,
  aerosol: uniform(new Vector3()) as UniformNode<"vec3", Vector3>,
  albedo: uniform(0.9) as UniformNode<"float", number>,
  asymmetry: uniform(0.7) as UniformNode<"float", number>,
  lensM: uniform(0.1) as UniformNode<"float", number>,
  fog: create_scene_fog(),
});

/**
 * A cone round +Z, its apex at the origin and its base the unit circle at
 * z = 1, closed, its faces outward. Scaled by the beam's half-angles and
 * length, it is the beam's hull.
 * @param segments Round its rim
 * @returns The geometry
 */
export const create_beam_geometry = (segments = 32): BufferGeometry => {
  const positions = [0, 0, 0, 0, 0, 1];
  const indices: number[] = [];

  for (let index = 0; index < segments; index++) {
    const angle = (index / segments) * Math.PI * 2;

    positions.push(Math.cos(angle), Math.sin(angle), 1);
  }

  for (let index = 0; index < segments; index++) {
    const here = 2 + index;
    const next = 2 + ((index + 1) % segments);

    indices.push(0, next, here, 1, here, next);
  }

  const geometry = new BufferGeometry();

  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);

  return geometry;
};

/**
 * A beam's material: its light in the air, summed along each ray.
 * @param options Its uniforms, how many samples, and the scene's depth if
 *   drawn in a pass of its own
 * @returns The material
 */
export const create_beam_material = (options: {
  uniforms: BeamUniforms;
  steps: number;
  backdrop?: SceneBackdrop;
}): MeshBasicNodeMaterial => {
  const { uniforms: u, steps, backdrop } = options;

  const origin = u.origin as unknown as V3;
  const across = u.across as unknown as V3;
  const up = u.up as unknown as V3;
  const along = u.along as unknown as V3;
  const tangents = u.tangents as unknown as V2;
  const beam_length = u.length as unknown as F;
  const inverse = u.inverse as unknown as V2;
  const rayleigh = u.rayleigh as unknown as V3;
  const aerosol = u.aerosol as unknown as V3;
  const albedo = u.albedo as unknown as F;
  const g = u.asymmetry as unknown as F;
  const lens = u.lensM as unknown as F;

  // Its back faces, so a camera inside the cone still draws it
  const material = new MeshBasicNodeMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: BackSide,
    fog: false,
  });

  material.fragmentNode = Fn(() => {
    const view_direction = normalize(positionView);
    const direction = normalize(positionWorld.sub(cameraPosition));

    // How far the opaque scene is along the ray
    const depth_per_metre = max(view_direction.z.negate(), 1e-6);
    const scene_end = scene_view_z(backdrop?.depth.sample(screenUV))
      .negate()
      .div(depth_per_metre);

    // The ray in the lamp's frame: x across, y up, z along the beam
    const relative = cameraPosition.sub(origin);
    const o = vec3(
      dot(relative, across),
      dot(relative, up),
      dot(relative, along),
    );
    const d = vec3(
      dot(direction, across),
      dot(direction, up),
      dot(direction, along),
    );

    const start = float(0).toVar();
    const end = scene_end.toVar();

    // Between the lamp and the cone's end
    const dz = select(
      abs(d.z).lessThan(1e-6),
      select(d.z.greaterThanEqual(0), float(1e-6), float(-1e-6)),
      d.z,
    );
    const at_lamp = o.z.negate().div(dz);
    const at_end = beam_length.sub(o.z).div(dz);

    start.assign(max(start, min(at_lamp, at_end)));
    end.assign(min(end, max(at_lamp, at_end)));

    // Inside the cone, (x/a)² + (y/b)² <= z²: a quadratic along the ray.
    // The slab above keeps the forward half, which a line crosses in one
    // piece, the half being convex
    const ia = float(1).div(tangents.x.mul(tangents.x));
    const ib = float(1).div(tangents.y.mul(tangents.y));
    const a_raw = d.x
      .mul(d.x)
      .mul(ia)
      .add(d.y.mul(d.y).mul(ib))
      .sub(d.z.mul(d.z));
    const a = select(
      abs(a_raw).lessThan(1e-6),
      select(a_raw.greaterThanEqual(0), float(1e-6), float(-1e-6)),
      a_raw,
    );
    const b = o.x.mul(d.x).mul(ia).add(o.y.mul(d.y).mul(ib)).sub(o.z.mul(d.z));
    const c = o.x.mul(o.x).mul(ia).add(o.y.mul(o.y).mul(ib)).sub(o.z.mul(o.z));
    const discriminant = b.mul(b).sub(a.mul(c));

    If(discriminant.lessThan(0), () => {
      // Never on the cone: wholly outside it, or wholly inside
      If(a.greaterThan(0), () => {
        Discard();
      });
    }).Else(() => {
      const root = sqrt(discriminant);
      const first = b.negate().sub(root).div(a);
      const second = b.negate().add(root).div(a);
      const low = min(first, second);
      const high = max(first, second);

      If(a.greaterThan(0), () => {
        start.assign(max(start, low));
        end.assign(min(end, high));
      }).Else(() => {
        // Inside beyond both roots: whichever piece the slab left
        const first_end = min(end, low);

        If(first_end.greaterThan(start), () => {
          end.assign(first_end);
        }).Else(() => {
          start.assign(max(start, high));
        });
      });
    });

    If(end.lessThanEqual(start), () => {
      Discard();
    });

    // Laid evenly in the angle the lamp sees them at: t = tc + h tan θ, tc
    // where the ray passes closest to the lamp and h how close
    const closest = dot(o, d).negate();
    const h = max(length(o.add(d.mul(closest))), 1e-3);
    const from_angle = atan(start.sub(closest).div(h));
    const to_angle = atan(end.sub(closest).div(h));
    const span = to_angle.sub(from_angle);

    // A different offset each pixel, so the samples' steps dither away
    const jitter = fract(
      fract(dot(screenCoordinate, vec2(0.06711056, 0.00583715))).mul(
        52.9829189,
      ),
    );

    const total = rayleigh.add(aerosol);
    const g2 = g.mul(g);
    const light = vec3(0).toVar();

    Loop(steps, ({ i }: { i: Node<"int"> }) => {
      const angle = from_angle.add(span.mul(float(i).add(jitter).div(steps)));
      const along_ray = closest.add(h.mul(tan(angle)));
      const p = o.add(d.mul(along_ray));
      const r2 = max(dot(p, p), lens.mul(lens));
      const r = sqrt(r2);

      // The lamp's intensity towards the sample, as a share of its peak
      const off_across = atan(p.x, p.z).mul(inverse.x);
      const off_up = atan(p.y, p.z).mul(inverse.y);
      const share = select(
        p.z.greaterThan(0),
        exp(off_across.mul(off_across).add(off_up.mul(off_up)).mul(-LN10)),
        float(0),
      );

      // Scattered back along the ray, by the molecules and by the haze
      const cos_theta = dot(p, d.negate()).div(r);
      const rayleigh_phase = cos_theta
        .mul(cos_theta)
        .add(1)
        .mul(3 / (16 * Math.PI));
      const haze_phase = float(1)
        .sub(g2)
        .div(pow(g2.add(1).sub(g.mul(2).mul(cos_theta)), 1.5).mul(4 * Math.PI));
      const scatter = rayleigh
        .mul(rayleigh_phase)
        .add(aerosol.mul(albedo).mul(haze_phase));

      // Dimmed on the way out from the lamp and back to the eye
      const kept = exp(total.mul(r.add(along_ray)).negate());

      // The sample's share of the ray: dt = (h² + (t - tc)²) dθ / h
      const offset = along_ray.sub(closest);
      const step = span
        .mul(h.mul(h).add(offset.mul(offset)))
        .div(h)
        .div(steps);

      light.addAssign(scatter.mul(kept).mul(share.div(r2).mul(step)));
    });

    // The scene's fog, at the stretch's middle
    const fog = scene_fog_factor(
      u.fog,
      start.add(end).mul(0.5).mul(depth_per_metre),
    );

    return vec4(light.mul(u.intensity as unknown as V3).mul(fog.oneMinus()), 0);
  })() as unknown as V4;

  // Light added over what is behind
  material.blending = CustomBlending;
  material.blendSrc = OneFactor;
  material.blendDst = OneMinusSrcAlphaFactor;
  material.blendSrcAlpha = OneFactor;
  material.blendDstAlpha = OneMinusSrcAlphaFactor;

  return material;
};
