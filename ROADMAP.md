# Roadmap

What's planned after `@aeronautic/lights`, in the same spirit as the rest:
each effect worked out from the physics and from measured data, its dials
physical quantities in SI units, never a look tuned by eye. A package lands
when it can say where every number comes from.

Nothing here has a date. Ideas, data sources and pull requests are welcome:
open an issue to discuss one before starting, as
[CONTRIBUTING.md](CONTRIBUTING.md) asks.

## `@aeronautic/countermeasures`

Flares and chaff, ejected, falling and burning out as the physics says.

- **Flares**: ejected at their cartridge's speed, then a ballistic body with
  its own drag, decelerating in the aircraft's slipstream and falling away.
  Their magnesium–PTFE burn gives the brightness, colour temperature and
  burn time, and the smoke trail's mass.
- **The smoke**: the burn's products, laid along each flare's path, mixing
  out and drifting with the wind, lit like the contrails' plume.
- **Chaff**: a cloud of dipoles blooming from the cartridge, slowing in the
  air and settling at their terminal velocity, glinting where the sun catches
  them.
- **Salvos and programs**: the dispenser's sequences, timed against the flight
  from a shared `Flight`.

## `@aeronautic/rotor`

Helicopter and tiltrotor effects, from the rotor's disc loading.

- **The downwash**: momentum theory's induced velocity from the disc loading,
  contracting below the disc and spreading in a wall jet along the ground.
- **Brownout and whiteout**: dust, sand, snow or spray lifted where the wall
  jet's speed passes the ground's threshold for it, swept up and back into the
  disc's inflow as the aircraft nears the ground.
- **Blade-tip vortices**: helical, from each tip at the disc's rotation, made
  visible as condensation in humid air, like wing-vapor's tip vortices.
- **The rotor's blur**: blades drawn with the camera's shutter rather than
  frozen or strobed, so the disc looks as it does on film.
- **Water**: the spray ring a hover kicks up over the sea.

## Under consideration

- **Shockwaves**: the shock pattern off an aircraft past Mach one, seen
  through the refraction of the density step (Schlieren) and in the
  condensation it can trigger.
- **The afterburner's water**: the plumes' own exhaust carrying the water
  `@aeronautic/contrails` uses, so a lit afterburner's trail follows from it.
