# ✦ Spirograph Studio

A tiny, dependency-free spirograph toy that runs entirely in the browser. Move the
sliders and watch a [hypotrochoid](https://en.wikipedia.org/wiki/Hypotrochoid) — the
curve traced by a point on a small gear rolling inside a larger ring — animate itself
into hypnotic patterns.

## Getting started

No build step, no dependencies. Just open the file:

```sh
# clone, then open index.html in any modern browser
start index.html      # Windows
open index.html       # macOS
xdg-open index.html   # Linux
```

## Controls

| Control          | What it does                                                         |
| ---------------- | ------------------------------------------------------------------- |
| **Outer ring**   | Radius of the fixed outer circle.                                   |
| **Inner gear**   | Radius of the rolling inner circle.                                 |
| **Pen offset**   | How far the pen sits from the inner gear's center.                  |
| **Speed**        | Number of curve segments drawn per animation frame.                 |
| **Line width**   | Thickness of the drawn line.                                        |
| **Palette**      | Pick a fixed pen color (also turns off the rainbow trail).          |
| **Rainbow trail**| Cycle the hue continuously as the curve is drawn.                   |
| **🎲 Surprise**  | Randomize the ring, gear, and offset for a fresh pattern.           |
| **Clear**        | Wipe the canvas and start the current pattern over.                 |
| **⬇ Save PNG**   | Download the current drawing as a PNG image.                        |

## How it works

The curve is a hypotrochoid, drawn with the standard parametric equations:

```
x = (R - r) · cos(θ) + d · cos((R - r) / r · θ)
y = (R - r) · sin(θ) - d · sin((R - r) / r · θ)
```

where `R` is the outer ring radius, `r` is the inner gear radius, `d` is the pen
offset, and `θ` is the running angle. Everything is drawn on a single `<canvas>` in
plain JavaScript — see [index.html](index.html).

## License

MIT
