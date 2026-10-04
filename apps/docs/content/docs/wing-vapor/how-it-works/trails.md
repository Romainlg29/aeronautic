---
title: Trails that follow the flight
description: "Why a tip trail curves in a turn and corkscrews in a roll."
---

A vortex stays in the air it was shed into while the aircraft flies on. So a
trail is not a tube stuck to the tip: it is the tip's own path through the
air, a curve in a turn and a corkscrew in a roll.

Every frame the vapor records the attitude of what it follows and integrates
its airspeed along its flight path, through the air rather than the world.
It lays both trails back along that history. Two things follow:

- **A model held still trails the same as one that flies.** A showcase that
  spins a model in place gets the same corkscrew as a game that flies it
  through the world, because the trail is laid through the air the airspeed
  says it crossed.
- **A slow frame doesn't kink the trail.** A long frame is split into steps,
  with the attitude turned evenly between them.

The trails go to the shader as two 64-point polylines in the aircraft's frame
as it is now, up to 400 m long. The tip's
[deficit](../the-pressure-field/#tip-vortices) is measured along them: how far
back a point is sets how rolled up and how spread the vortex is there.

The roll rate is measured the same way, from how the attitude turns between
frames, unless `flight.roll_rate_rad_s` gives it.
