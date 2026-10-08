---
title: Flashes
description: "The anti-collision lights' effective intensity, with Blondel and Rey."
---

A strobe's flash lasts a fraction of a millisecond. The eye does not see its
peak: it adds its light up over about 0.2 s. The rule asks for an effective
intensity of 400 cd (25.1401), worked out with Blondel and Rey's law:

```
Ie = ∫ I dt / (0.2 + t₂ − t₁)
```

with the integral from t₁ to t₂, over the window that makes it largest: where
the flash is at least as bright as Iₑ. For a flash dying away as a xenon
tube's does, that window is found by Newton's method. With a time constant of
0.2 ms it lasts 1.4 ms, and 400 cd effective takes a peak of 403 000 cd.

With `perception: "eye"`, a flash is drawn at its effective intensity for as
long as the eye adds it up: 0.2 s plus the window. With `camera`, it is drawn
as its light over each frame, as a camera's shutter gathers it: a whole flash
in one frame.

Above and below the horizontal, the rule's minima fall: to 60 % at 10°, 20 %
at 20°, 5 % from 75°. The lights are drawn at those shares.
