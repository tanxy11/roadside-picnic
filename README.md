# Pilman Radiant Simulator

A browser-based Three.js simulation of the rotating-globe bullet-hole curve inspired by the Pilman Radiant from *Roadside Picnic*.

## What It Simulates

The globe rotates around a configurable spin axis. In **Pilman** mode, each shot is fired at a fixed world-space point while the globe spins underneath it. The impact locations are stored in globe-local coordinates, so the holes stay attached to the surface and reveal a small-circle curve.

In **Through** mode, the fixed shot line penetrates the globe. Each shot records both the entry point and the delayed exit point after the globe has rotated during the bullet's transit time, then draws the curved material-frame tunnel through the transparent sphere.

In **Free Aim** mode, clicking the visible globe places impacts wherever the pointer ray hits the surface.

## Local Testing

```bash
npm install
npm run dev
```

Then open the local URL Vite prints, usually:

```txt
http://localhost:5173/
```

Production build:

```bash
npm run build
npm run preview
```

## Controls

- **Fire** adds a shot.
- **Pause Spin** freezes the globe so you can orbit the camera and inspect the curve. Press `P` for the same toggle.
- **Pilman / Through / Free Aim** switches between surface impacts, penetrating shots, and pointer-based firing.
- **Angular Speed** controls globe rotation in degrees per second.
- **Axis Tilt / Axis Azimuth** control the spin axis.
- **Yaw / Pitch** move the fixed radiant in Pilman mode.
- **Transit Time** controls how long a penetrating bullet spends inside the globe before it exits. Higher values create a larger rotational shift.
- **Fitted Curve** shows the small-circle curve implied by the impacts.
- **Shot Trace** connects the impacts in firing order.
- **Transparent Globe** makes the sphere translucent for inspecting through-shot tunnels and exit traces.
- **Export** downloads shot data as JSON.

## GitHub Pages

The Vite config uses `base: "./"`, so the built files can be hosted from a GitHub Pages project site.

```bash
npm run build
```

Upload or publish the generated `dist/` directory.
