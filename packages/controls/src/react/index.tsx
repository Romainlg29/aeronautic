import { dev_warn, type Flight } from "@aeronautic/core";
import {
  shared_context,
  type Thrust,
  ThrustContext,
  useFlightStore,
} from "@aeronautic/core/react";
import { createPortal, useFrame } from "@react-three/fiber";
import {
  type FC,
  type ReactNode,
  type Ref,
  useContext,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { AnimationClip, Object3D } from "three";
import { Engine, type EngineOptions, engine_sides } from "../engine";
import type { FighterControlsOptions } from "../fighter";
import {
  ailerons,
  airbrakes,
  canards,
  cockpit,
  type CockpitOptions,
  drag_rudders,
  elevators,
  elevons,
  flaps,
  gear,
  type GearOptions,
  leading_edge_flaps,
  type LeadingEdgeFlapOptions,
  type PartOptions,
  rudders,
  spoilers,
  stabilators,
  type TailOptions,
} from "../parts";
import {
  type ClipDriveOptions,
  type ControlDrive,
  ControlRig,
  type ControlRigOptions,
  type ControlRates,
  type DriveOptions,
} from "../rig";
import type { ControlAnchor, ControlSurface } from "../surfaces";

// The rig, for React
//
// `<Airframe>` makes one rig for a model and moves it in one frame callback,
// after the `<FlightProvider>`'s. Each part inside it adds its drive when it
// mounts and takes it away when it unmounts; its props are read in place
// whenever the flight changes, so changing a `from` re-renders nothing and
// re-registers nothing. Only a change of which parts it takes does

const AirframeContext = shared_context<ControlRig | null>("airframe", null);

/**
 * The rig of the nearest `<Airframe>`, once its model is there.
 * @returns The rig, or null
 */
export const useAirframe = (): ControlRig | null => useContext(AirframeContext);

/**
 * Props for `<Airframe>`.
 */
export type AirframeProps = Omit<
  ControlRigOptions,
  "source" | "animations" | "rates"
> & {
  /** The model, as a loaded glTF's scene */
  object: Object3D | null | undefined;

  /** The model's clips, for its parts to scrub */
  animations?: readonly AnimationClip[];

  /**
   * The flight its parts read. By default the nearest `<FlightProvider>`'s;
   * null moves only what is set by hand
   */
  source?: Flight | null;

  /** How fast each kind moves, over the defaults */
  rates?: Partial<ControlRates>;

  /** The frame callback's priority, as `useFrame`'s */
  priority?: number;

  /** The rig, to move parts by hand or read where they are */
  ref?: Ref<ControlRig | null>;

  /** The parts that move it, and anything else */
  children?: ReactNode;
};

/**
 * A model's moving parts. Moves nothing by itself: put the parts that should
 * move inside it, as `<Elevons />` and `<Rudders />`, or `<FighterControls />`
 * for all of them.
 * @param props The model, and how to rig it
 * @returns Its children
 */
export const Airframe: FC<AirframeProps> = ({
  object,
  animations,
  source,
  rates,
  settle,
  forward,
  up,
  rig: read_rig,
  names,
  filter,
  priority = 0,
  ref,
  children,
}) => {
  const provided = useFlightStore();
  const flight = source === undefined ? provided : source;
  const [rig, set_rig] = useState<ControlRig | null>(null);

  // Read when the rig is made; the rest are applied below
  const initial = useRef({ flight, settle });

  initial.current = { flight, settle };

  const frame_key = JSON.stringify([forward, up]);

  useLayoutEffect(() => {
    if (!object) return;

    const created = new ControlRig(object, {
      animations,
      rig: read_rig,
      names,
      filter,
      forward,
      up,
      source: initial.current.flight,
      settle: initial.current.settle,
    });

    set_rig(created);

    if (created.surfaces.length === 0 && created.clips.size === 0) {
      dev_warn(
        `airframe:empty:${object.uuid}`,
        `<Airframe> found no control surfaces in "${object.name || "its model"}". ` +
          "Name the moving nodes CTRL_Aileron_L, CTRL_Rudder and so on, or pass `names` to map yours.",
      );
    }

    return () => {
      set_rig(null);
      created.dispose();
    };
    // The frame by value, not by the arrays' identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [object, animations, read_rig, names, filter, frame_key]);

  useLayoutEffect(() => {
    if (rig) rig.source = flight;
  }, [rig, flight]);

  const rates_key = JSON.stringify(rates ?? {});

  useLayoutEffect(() => {
    if (!rig || !rates) return;

    Object.assign(rig.rates, rates);
    rig.refresh();
    // By value
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rig, rates_key]);

  useImperativeHandle<ControlRig | null, ControlRig | null>(ref, () => rig, [
    rig,
  ]);

  useFrame((_, delta) => {
    rig?.update(delta);
  }, priority);

  return (
    <AirframeContext.Provider value={rig}>{children}</AirframeContext.Provider>
  );
};

/**
 * Props kept in one object for the life of a component, its fields brought
 * up to date each render, for a drive to read in place.
 * @param props This render's
 * @returns The same object each render
 */
const useLive = <T extends object>(props: T): T => {
  const live = useRef<T>({ ...props });

  for (const key of Object.keys(live.current) as (keyof T)[]) {
    if (!(key in props)) delete live.current[key];
  }

  Object.assign(live.current, props);

  return live.current;
};

/**
 * Which parts a selection takes, as a key that changes only when they do.
 * @param props The selection
 * @returns The key
 */
const selection_key = (props: {
  parts?: readonly string[];
  group?: string;
  kinds?: readonly string[];
  side?: string;
}) => JSON.stringify([props.parts, props.group, props.kinds, props.side]);

/**
 * Add a drive while mounted, adding it again only when its parts change.
 * @param install Adds it to a rig
 * @param props Its props, read in place
 * @param key What makes it take other parts
 * @param filter Its filter, which does too
 * @returns The drive, once added
 */
const useDrive = <P extends object>(
  install: (rig: ControlRig, props: P) => ControlDrive,
  props: P,
  key: string,
  filter?: unknown,
): ControlDrive | null => {
  const rig = useAirframe();
  const live = useLive(props);
  const [drive, set_drive] = useState<ControlDrive | null>(null);

  useLayoutEffect(() => {
    if (!rig) return;

    const added = install(rig, live);

    set_drive(added);

    const asked = (live as { parts?: readonly string[] }).parts;

    if (asked?.length && added.parts.length === 0) {
      dev_warn(
        `drive:${asked.join(",")}`,
        `No part of the model is named ${asked.map((name) => `"${name}"`).join(" or ")}. ` +
          `Its parts are: ${rig.surfaces.map((part) => part.name).join(", ") || "none"}.`,
      );
    }

    return () => {
      set_drive(null);
      added.dispose();
    };
    // The selection by value
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rig, key, filter]);

  // Any other change is read in place, at the next frame
  useLayoutEffect(() => {
    drive?.refresh();
  });

  return drive;
};

/**
 * Make a part's component.
 * @param install Adds the part's drive
 * @returns The component
 */
const part_component = <P extends PartOptions>(
  install: (rig: ControlRig, options: P) => ControlDrive,
): FC<P> => {
  const Part: FC<P> = (props) => {
    useDrive(install, props, selection_key(props), props.filter);

    return null;
  };

  return Part;
};

/** Ailerons, with the stick's roll. `from` gives a share of throw */
export const Ailerons = part_component<PartOptions>(ailerons);

/** Elevators, with the stick's pitch. `from` gives a share of throw */
export const Elevators = part_component<PartOptions>(elevators);

/** Elevons, pitching and rolling. `from` gives a share of throw */
export const Elevons = part_component<TailOptions>(elevons);

/** All-moving tailplanes, pitching and rolling. `from` gives a share of throw */
export const Stabilators = part_component<TailOptions>(stabilators);

/** Canards, with the stick's pitch. `from` gives a share of throw */
export const Canards = part_component<PartOptions>(canards);

/** Rudders, with the pedals. `from` gives a share of throw */
export const Rudders = part_component<PartOptions>(rudders);

/** Trailing-edge flaps. `from` gives a share of travel */
export const Flaps = part_component<PartOptions>(flaps);

/** Leading-edge flaps, with the angle of attack. `from` gives degrees */
export const LeadingEdgeFlaps =
  part_component<LeadingEdgeFlapOptions>(leading_edge_flaps);

/** Air brakes. `from` gives a share of travel */
export const Airbrakes = part_component<PartOptions>(airbrakes);

/** Spoilers, with the air brake. `from` gives a share of travel */
export const Spoilers = part_component<PartOptions>(spoilers);

/** Split drag rudders, braking and yawing. `from` gives a share of travel */
export const DragRudders = part_component<PartOptions>(drag_rudders);

/** The stick, the pedals and the throttle lever */
export const Cockpit = part_component<CockpitOptions>(cockpit);

/**
 * The landing gear: legs, doors and lever, or the model's retraction clip.
 * `from` gives how far down, 0 to 1.
 * @param props How it is driven
 * @returns Nothing
 */
export const Gear: FC<GearOptions> = (props) => {
  useDrive(gear, props, JSON.stringify([props.side, String(props.clip)]));

  return null;
};

/**
 * Drive any parts from the flight. `from` gives the part's value in its
 * unit.
 * @param props Which parts, and where each should be
 * @returns Nothing
 */
export const Drive: FC<DriveOptions> = (props) => {
  useDrive(
    (rig, options: DriveOptions) => rig.drive(options),
    props,
    selection_key(props),
    props.filter,
  );

  return null;
};

/**
 * Scrub a model's clip from the flight, as `ANIM_Canopy_Open`. `from` gives
 * how far through it, 0 to 1.
 * @param props Which clip, and how far through
 * @returns Nothing
 */
export const Clip: FC<ClipDriveOptions> = (props) => {
  useDrive(
    (rig, options: ClipDriveOptions) => rig.driveClip(options),
    props,
    JSON.stringify([String(props.clip), props.side]),
  );

  return null;
};

/**
 * One part of the nearest `<Airframe>`, by name: its limits, its extras and
 * its node.
 * @param name The node's name, as `CTRL_Rudder_L`
 * @returns The part, once the rig is there
 */
export const usePart = (name: string): ControlSurface | null => {
  const rig = useAirframe();
  const part = rig?.surface(name) ?? null;

  if (rig && !part) {
    dev_warn(
      `part:${name}`,
      `usePart("${name}"): no part of the model has that name. ` +
        `Its parts are: ${rig.surfaces.map((surface) => surface.name).join(", ") || "none"}.`,
    );
  }

  return part;
};

/**
 * One anchor of the nearest `<Airframe>`, by name: its kind, its extras and
 * its node.
 * @param name The node's name, as `FX_Gun_Muzzle_R`
 * @returns The anchor, once the rig is there
 */
export const useAnchor = (name: string): ControlAnchor | null => {
  const rig = useAirframe();
  const anchor = rig?.anchor(name) ?? null;

  if (rig && !anchor) {
    dev_warn(
      `anchor:${name}`,
      `useAnchor("${name}"): no anchor of the model has that name. ` +
        `Its anchors are: ${rig.anchors.map((found) => found.name).join(", ") || "none"}.`,
    );
  }

  return anchor;
};

/**
 * Props for `<Attach>`.
 */
export type AttachProps = {
  /** A part, by name: the children move with it */
  part?: string;

  /** Or an anchor, by name, as `FX_Gun_Muzzle_R` */
  anchor?: string;

  children?: ReactNode;
};

/**
 * Put things on a part or an anchor of the model, in its frame, so they move
 * with it.
 * @param props Where, and what
 * @returns The children, there
 */
export const Attach: FC<AttachProps> = ({ part, anchor, children }) => {
  const rig = useAirframe();

  if (rig && part !== undefined && !rig.surface(part)) {
    dev_warn(
      `attach:part:${part}`,
      `<Attach part="${part}">: no part of the model has that name.`,
    );
  }

  if (rig && anchor !== undefined && !rig.anchor(anchor)) {
    dev_warn(
      `attach:anchor:${anchor}`,
      `<Attach anchor="${anchor}">: no anchor of the model has that name.`,
    );
  }

  const node =
    (part !== undefined ? rig?.surface(part)?.node : undefined) ??
    (anchor !== undefined ? rig?.anchor(anchor)?.node : undefined);

  return node ? createPortal(children, node) : null;
};

const EngineContext = shared_context<Engine | null>("engine", null);

/**
 * The nearest `<Engine>`: its nozzle's parts and limits, where its exhaust
 * points, its anchor.
 * @returns The engine, once its rig is there
 */
export const useEngine = (): Engine | null => useContext(EngineContext);

/**
 * Props for `<Engine>`.
 */
export type EngineProps = EngineOptions & {
  /** The engine, to read where it points */
  ref?: Ref<Engine | null>;

  /**
   * Its afterburner, and anything else on its exhaust: an `<Afterburner>`
   * inside sits on the exhaust, turns with the nozzle and runs at the
   * engine's throttle
   */
  children?: ReactNode;
};

/**
 * One engine: its nozzle opening with the throttle and turning with the
 * stick and the pedals, its limits read off the model.
 * @param props Which engine, and how
 * @returns Its children, on its thrust
 */
export const EngineControl: FC<EngineProps> = ({ ref, children, ...props }) => {
  const rig = useAirframe();
  const live = useLive(props);
  const [engine, set_engine] = useState<Engine | null>(null);

  const anchor_key =
    typeof props.anchor === "object" ? props.anchor : String(props.anchor);
  const key = JSON.stringify([props.side, props.vectoring]);

  useLayoutEffect(() => {
    if (!rig) return;

    const created = new Engine(rig, live);

    set_engine(created);

    if (!created.anchor) {
      dev_warn(
        `engine:exhaust:${anchor_key}:${String(props.side)}`,
        "<Engine> found no exhaust to put its effects on. Mark the model's nozzle exit with an " +
          "FX_Exhaust node, or pass `anchor` with the node or its name.",
      );
    }

    return () => {
      set_engine(null);
      created.dispose();
    };
    // Which engine, and what its nozzle can do, by value
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rig, key, anchor_key]);

  useLayoutEffect(() => {
    engine?.refresh();
  });

  useImperativeHandle<Engine | null, Engine | null>(ref, () => engine, [
    engine,
  ]);

  const thrust = useMemo<Thrust | null>(
    () =>
      engine ? { anchor: engine.anchor, throttle: engine.throttle } : null,
    [engine],
  );

  return (
    <EngineContext.Provider value={engine}>
      <ThrustContext.Provider value={thrust}>{children}</ThrustContext.Provider>
    </EngineContext.Provider>
  );
};

export { EngineControl as Engine };

/**
 * Props for `<FighterControls>`.
 */
export type FighterControlsProps = FighterControlsOptions & {
  /** Put inside each engine, as an `<Afterburner />` */
  exhaust?: ReactNode;
};

/**
 * Every part of a fighter, driven the way a fighter's are, and an engine for
 * each side with a nozzle.
 * @param props How
 * @returns The parts
 */
export const FighterControls: FC<FighterControlsProps> = ({
  pitchShare: pitch_share,
  engine,
  exhaust,
}) => {
  const rig = useAirframe();
  const sides = useMemo(() => (rig ? engine_sides(rig) : []), [rig]);

  return (
    <>
      <Ailerons />
      <Elevators />
      <Elevons pitchShare={pitch_share} />
      <Stabilators pitchShare={pitch_share} />
      <Canards />
      <Rudders />
      <Flaps />
      <LeadingEdgeFlaps />
      <Airbrakes />
      <Spoilers />
      <DragRudders />
      <Gear />
      <Cockpit />
      {sides.map((side) => (
        <EngineControl key={side ?? "centre"} {...engine} side={side}>
          {exhaust}
        </EngineControl>
      ))}
    </>
  );
};

/**
 * Props for `<ControlSurfaces>`.
 */
export type ControlSurfacesProps = AirframeProps & FighterControlsProps;

/**
 * A model's control surfaces, nozzles and gear, all moving with the flight
 * of the nearest `<FlightProvider>`: an `<Airframe>` with
 * `<FighterControls>`.
 * @param props The model, how to rig it and how to drive it
 * @returns The rig's parts
 */
export const ControlSurfaces: FC<ControlSurfacesProps> = ({
  pitchShare: pitch_share,
  engine,
  exhaust,
  children,
  ...airframe
}) => (
  <Airframe {...airframe}>
    <FighterControls
      pitchShare={pitch_share}
      engine={engine}
      exhaust={exhaust}
    />
    {children}
  </Airframe>
);

export { ControlRig };
