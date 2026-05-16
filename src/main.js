import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  Activity,
  CircleDot,
  Crosshair,
  Download,
  Gauge,
  Pause,
  Play,
  RotateCcw,
  Route,
  Target,
  Timer,
  createIcons,
} from "lucide";
import "./styles.css";
import {
  curveErrorDegrees,
  directionFromYawPitch,
  fittedSmallCircleConstant,
  latLonFromVector,
  orientationAt,
  serializeShot,
  smallCirclePoints,
  sphericalTracePoints,
  spinAxisFromAngles,
  worldSurfaceToLocal,
} from "./simulation.js";

const RADIUS = 2;
const CURVE_RADIUS = RADIUS * 1.018;
const MARKER_RADIUS = RADIUS * 1.026;
const MAX_LOG_ITEMS = 9;

const state = {
  elapsed: 0,
  angularSpeedDeg: 42,
  axisTilt: 24,
  axisAzimuth: 35,
  radiantYaw: -26,
  radiantPitch: 12,
  autoInterval: 0.75,
  autoFire: false,
  paused: false,
  mode: "pilman",
  showPrediction: true,
  showTrace: true,
  showGrid: true,
  shots: [],
  nextShotId: 1,
  lastAutoShotAt: 0,
};

const elements = {
  canvas: document.querySelector("#scene"),
  shotCount: document.querySelector("#shot-count"),
  curveError: document.querySelector("#curve-error"),
  speedReadout: document.querySelector("#speed-readout"),
  fireButton: document.querySelector("#fire-button"),
  autoButton: document.querySelector("#auto-button"),
  pauseButton: document.querySelector("#pause-button"),
  resetButton: document.querySelector("#reset-button"),
  exportButton: document.querySelector("#export-button"),
  modeButtons: [...document.querySelectorAll(".mode-button")],
  speedInput: document.querySelector("#speed-input"),
  speedOutput: document.querySelector("#speed-output"),
  tiltInput: document.querySelector("#tilt-input"),
  tiltOutput: document.querySelector("#tilt-output"),
  azimuthInput: document.querySelector("#azimuth-input"),
  azimuthOutput: document.querySelector("#azimuth-output"),
  yawInput: document.querySelector("#yaw-input"),
  yawOutput: document.querySelector("#yaw-output"),
  pitchInput: document.querySelector("#pitch-input"),
  pitchOutput: document.querySelector("#pitch-output"),
  intervalInput: document.querySelector("#interval-input"),
  intervalOutput: document.querySelector("#interval-output"),
  predictionToggle: document.querySelector("#prediction-toggle"),
  traceToggle: document.querySelector("#trace-toggle"),
  gridToggle: document.querySelector("#grid-toggle"),
  shotLog: document.querySelector("#shot-log"),
};

const iconSet = {
  Activity,
  CircleDot,
  Crosshair,
  Download,
  Gauge,
  Pause,
  Play,
  RotateCcw,
  Route,
  Target,
  Timer,
};

renderIcons();

const renderer = new THREE.WebGLRenderer({
  canvas: elements.canvas,
  antialias: true,
  alpha: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x050706, 0.035);

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
camera.position.set(0, 0.65, 7.1);

const controls = new OrbitControls(camera, elements.canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.enablePan = false;
controls.minDistance = 4.4;
controls.maxDistance = 9.5;
controls.rotateSpeed = 0.55;

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const clock = new THREE.Clock();
const markerMeshes = new Map();

const globeGroup = new THREE.Group();
scene.add(globeGroup);

const globeMesh = new THREE.Mesh(
  new THREE.SphereGeometry(RADIUS, 128, 72),
  new THREE.MeshStandardMaterial({
    map: createGlobeTexture(),
    bumpMap: createBumpTexture(),
    bumpScale: 0.045,
    roughness: 0.84,
    metalness: 0.06,
    emissive: new THREE.Color(0x07100d),
    emissiveIntensity: 0.22,
  }),
);
globeMesh.name = "rotating-globe";
globeGroup.add(globeMesh);

const nightGlow = new THREE.Mesh(
  new THREE.SphereGeometry(RADIUS * 1.013, 128, 72),
  new THREE.MeshBasicMaterial({
    color: 0x9bf7d3,
    transparent: true,
    opacity: 0.07,
    blending: THREE.AdditiveBlending,
  }),
);
globeGroup.add(nightGlow);

const graticule = createGraticule(RADIUS * 1.006);
globeGroup.add(graticule);

const curveGroup = new THREE.Group();
globeGroup.add(curveGroup);

const axisLine = new THREE.Line(
  new THREE.BufferGeometry(),
  new THREE.LineBasicMaterial({ color: 0xf5e7b3, transparent: true, opacity: 0.54 }),
);
scene.add(axisLine);

const radiantGroup = createRadiantGroup();
scene.add(radiantGroup);

const hoverMarker = createSurfaceRing(0x9bf7d3, 0.105, 0.007, 0.72);
hoverMarker.visible = false;
scene.add(hoverMarker);

const shotFlash = createShotFlash();
scene.add(shotFlash);

addLighting();
addStarfield();
bindControls();
resizeRenderer();
updateAllReadouts();
updateAxisVisual();
updateRadiantVisual();
updateCurves();
animate();

function addLighting() {
  scene.add(new THREE.HemisphereLight(0xd8fff0, 0x100804, 1.35));

  const key = new THREE.DirectionalLight(0xffffff, 2.7);
  key.position.set(3.5, 4.5, 5.6);
  scene.add(key);

  const ember = new THREE.PointLight(0xffa75a, 18, 18, 1.8);
  ember.position.set(-4.5, -2.2, 3);
  scene.add(ember);

  const mint = new THREE.PointLight(0x7fffd4, 11, 13, 1.5);
  mint.position.set(2.6, 1.8, -3.5);
  scene.add(mint);
}

function bindControls() {
  elements.fireButton.addEventListener("click", () => fireCurrentMode());
  elements.pauseButton.addEventListener("click", toggleSpinPause);
  elements.resetButton.addEventListener("click", resetShots);
  elements.exportButton.addEventListener("click", exportShots);
  elements.autoButton.addEventListener("click", toggleAutoFire);

  elements.modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.mode;
      elements.modeButtons.forEach((item) => item.classList.toggle("is-active", item === button));
      updateHoverMarker();
      updateRadiantVisual();
    });
  });

  bindRange(elements.speedInput, elements.speedOutput, "angularSpeedDeg", "deg/s", () => {
    updateAllReadouts();
    updateCurves();
  });
  bindRange(elements.tiltInput, elements.tiltOutput, "axisTilt", "deg", () => {
    updateAxisVisual();
    updateCurves();
  });
  bindRange(elements.azimuthInput, elements.azimuthOutput, "axisAzimuth", "deg", () => {
    updateAxisVisual();
    updateCurves();
  });
  bindRange(elements.yawInput, elements.yawOutput, "radiantYaw", "deg", () => {
    updateRadiantVisual();
    updateCurves();
  });
  bindRange(elements.pitchInput, elements.pitchOutput, "radiantPitch", "deg", () => {
    updateRadiantVisual();
    updateCurves();
  });
  bindRange(elements.intervalInput, elements.intervalOutput, "autoInterval", "s");

  elements.predictionToggle.addEventListener("change", () => {
    state.showPrediction = elements.predictionToggle.checked;
    updateCurves();
  });
  elements.traceToggle.addEventListener("change", () => {
    state.showTrace = elements.traceToggle.checked;
    updateCurves();
  });
  elements.gridToggle.addEventListener("change", () => {
    state.showGrid = elements.gridToggle.checked;
    graticule.visible = state.showGrid;
  });

  let pointerDown = null;

  elements.canvas.addEventListener("pointerdown", (event) => {
    pointerDown = { x: event.clientX, y: event.clientY, at: performance.now() };
  });

  elements.canvas.addEventListener("pointermove", (event) => {
    setPointerFromEvent(event);
    updateHoverMarker();
  });

  elements.canvas.addEventListener("pointerleave", () => {
    hoverMarker.visible = false;
  });

  elements.canvas.addEventListener("pointerup", (event) => {
    if (!pointerDown) {
      return;
    }

    const distance = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y);
    const duration = performance.now() - pointerDown.at;
    pointerDown = null;

    if (distance <= 6 && duration < 500) {
      setPointerFromEvent(event);
      fireCurrentMode();
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.code === "Space" && !event.repeat) {
      event.preventDefault();
      fireCurrentMode();
    }

    if (event.key.toLowerCase() === "p" && !event.repeat) {
      toggleSpinPause();
    }
  });

  window.addEventListener("resize", resizeRenderer);
}

function bindRange(input, output, stateKey, suffix, onChange = () => {}) {
  const update = () => {
    const value = Number(input.value);
    state[stateKey] = value;
    output.textContent = suffix === "s" ? `${value.toFixed(2)} s` : `${Math.round(value)} ${suffix}`;
    onChange();
  };

  input.addEventListener("input", update);
  update();
}

function animate() {
  requestAnimationFrame(animate);

  const delta = Math.min(clock.getDelta(), 0.05);
  controls.update();

  if (!state.paused) {
    state.elapsed += delta;
  }

  const axis = getSpinAxis();
  const orientation = getOrientation(axis);
  globeGroup.quaternion.copy(orientation);

  const flashAge = performance.now() - shotFlash.userData.startedAt;
  shotFlash.material.opacity = Math.max(0, 1 - flashAge / 210) * 0.68;

  if (state.autoFire && !state.paused && state.elapsed - state.lastAutoShotAt >= state.autoInterval) {
    fireCurrentMode();
    state.lastAutoShotAt = state.elapsed;
  }

  updateHoverMarker();
  renderer.render(scene, camera);
}

function getSpinAxis() {
  return spinAxisFromAngles(state.axisTilt, state.axisAzimuth);
}

function getAngularSpeedRad() {
  return THREE.MathUtils.degToRad(state.angularSpeedDeg);
}

function getOrientation(axis = getSpinAxis()) {
  return orientationAt(axis, getAngularSpeedRad(), state.elapsed);
}

function getRadiantWorldPoint() {
  return directionFromYawPitch(state.radiantYaw, state.radiantPitch);
}

function fireCurrentMode() {
  if (state.mode === "free") {
    const hit = getPointerGlobeHit();

    if (hit) {
      addShot(globeGroup.worldToLocal(hit.point.clone()).normalize(), "free");
      pulseFlash(hit.point.clone().normalize());
    }

    return;
  }

  const axis = getSpinAxis();
  const orientation = getOrientation(axis);
  const worldPoint = getRadiantWorldPoint();
  const localPoint = worldSurfaceToLocal(worldPoint, orientation);

  addShot(localPoint, "pilman");
  pulseFlash(worldPoint);
}

function addShot(localVector, mode) {
  const local = localVector.clone().normalize();
  const marker = createImpactMarker(local, mode);
  const shot = {
    id: state.nextShotId,
    mode,
    local,
    marker,
    elapsed: state.elapsed,
    angularSpeedRad: getAngularSpeedRad(),
  };

  state.nextShotId += 1;
  state.shots.push(shot);
  markerMeshes.set(shot.id, marker);
  globeGroup.add(marker);

  updateCurves();
  updateShotLog();
  updateAllReadouts();
}

function createImpactMarker(local, mode) {
  const group = new THREE.Group();
  const color = mode === "pilman" ? 0xffcf5f : 0x9bf7d3;
  const normal = local.clone().normalize();
  const basePosition = normal.clone().multiplyScalar(MARKER_RADIUS);

  const scorch = new THREE.Mesh(
    new THREE.CircleGeometry(0.066, 34),
    new THREE.MeshBasicMaterial({
      color: 0x090806,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  const ring = createSurfaceRing(color, 0.083, 0.007, 0.92);
  const halo = createSurfaceRing(color, 0.13, 0.003, 0.35);

  group.position.copy(basePosition);
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  group.add(scorch, ring, halo);

  return group;
}

function createSurfaceRing(color, radius, tube, opacity) {
  return new THREE.Mesh(
    new THREE.TorusGeometry(radius, tube, 10, 48),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
}

function createRadiantGroup() {
  const group = new THREE.Group();
  const beamMaterial = new THREE.LineBasicMaterial({
    color: 0xffcf5f,
    transparent: true,
    opacity: 0.92,
  });
  const beam = new THREE.Line(new THREE.BufferGeometry(), beamMaterial);
  const ring = createSurfaceRing(0xffcf5f, 0.15, 0.006, 0.78);
  const core = new THREE.Mesh(
    new THREE.CircleGeometry(0.035, 28),
    new THREE.MeshBasicMaterial({
      color: 0xfff1bf,
      transparent: true,
      opacity: 0.94,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );

  group.userData.beam = beam;
  group.userData.ring = ring;
  group.userData.core = core;
  group.add(beam, ring, core);

  return group;
}

function createShotFlash() {
  const flash = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({
      color: 0xfff1bf,
      transparent: true,
      opacity: 0,
    }),
  );
  flash.userData.startedAt = -Infinity;
  return flash;
}

function pulseFlash(worldPoint) {
  const normal = worldPoint.clone().normalize();
  const source = normal.clone().multiplyScalar(RADIUS * 3.35);
  const target = normal.clone().multiplyScalar(RADIUS * 1.02);

  shotFlash.geometry.dispose();
  shotFlash.geometry = new THREE.BufferGeometry().setFromPoints([source, target]);
  shotFlash.userData.startedAt = performance.now();
}

function getPointerGlobeHit() {
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObject(globeMesh, false);

  return hits[0] ?? null;
}

function setPointerFromEvent(event) {
  const rect = elements.canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
}

function updateHoverMarker() {
  if (state.mode !== "free") {
    hoverMarker.visible = false;
    return;
  }

  const hit = getPointerGlobeHit();

  if (!hit) {
    hoverMarker.visible = false;
    return;
  }

  const normal = hit.point.clone().normalize();
  hoverMarker.visible = true;
  hoverMarker.position.copy(normal.multiplyScalar(MARKER_RADIUS));
  hoverMarker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), hit.point.clone().normalize());
}

function updateRadiantVisual() {
  const worldPoint = getRadiantWorldPoint();
  const source = worldPoint.clone().multiplyScalar(RADIUS * 3.4);
  const target = worldPoint.clone().multiplyScalar(RADIUS * 1.02);
  const ring = radiantGroup.userData.ring;
  const core = radiantGroup.userData.core;
  const visible = state.mode === "pilman";

  radiantGroup.visible = visible;
  radiantGroup.userData.beam.geometry.dispose();
  radiantGroup.userData.beam.geometry = new THREE.BufferGeometry().setFromPoints([source, target]);
  ring.position.copy(target);
  ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), worldPoint);
  core.position.copy(target.clone().multiplyScalar(1.002));
  core.quaternion.copy(ring.quaternion);
}

function updateAxisVisual() {
  const axis = getSpinAxis();
  const points = [
    axis.clone().multiplyScalar(-RADIUS * 1.42),
    axis.clone().multiplyScalar(RADIUS * 1.42),
  ];

  axisLine.geometry.dispose();
  axisLine.geometry = new THREE.BufferGeometry().setFromPoints(points);
}

function updateCurves() {
  clearCurveGroup();

  const localShots = state.shots.map((shot) => shot.local);
  const axis = getSpinAxis();

  if (state.showPrediction) {
    const fallback = axis.dot(getRadiantWorldPoint());
    const constant = fittedSmallCircleConstant(axis, localShots, fallback);
    const predictionPoints = smallCirclePoints(axis, constant, 300)
      .map((point) => point.multiplyScalar(CURVE_RADIUS));
    const prediction = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(predictionPoints),
      new THREE.LineBasicMaterial({
        color: 0x9bf7d3,
        transparent: true,
        opacity: 0.95,
      }),
    );

    curveGroup.add(prediction);
  }

  if (state.showTrace && localShots.length >= 2) {
    const tracePoints = sphericalTracePoints(localShots)
      .map((point) => point.multiplyScalar(CURVE_RADIUS * 1.004));
    const trace = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(tracePoints),
      new THREE.LineBasicMaterial({
        color: 0xffcf5f,
        transparent: true,
        opacity: 0.96,
      }),
    );

    curveGroup.add(trace);
  }
}

function clearCurveGroup() {
  for (const child of [...curveGroup.children]) {
    child.geometry?.dispose();
    child.material?.dispose();
    curveGroup.remove(child);
  }
}

function updateAllReadouts() {
  const localShots = state.shots.map((shot) => shot.local);
  elements.shotCount.textContent = String(state.shots.length);
  elements.speedReadout.textContent = state.paused ? "Paused" : `${Math.round(state.angularSpeedDeg)} deg/s`;
  elements.curveError.textContent = `${curveErrorDegrees(getSpinAxis(), localShots).toFixed(2)} deg`;
}

function toggleSpinPause() {
  state.paused = !state.paused;
  updatePauseButton();
  updateAllReadouts();
}

function updatePauseButton() {
  elements.pauseButton.classList.toggle("is-paused", state.paused);
  elements.pauseButton.setAttribute(
    "aria-label",
    state.paused ? "Resume globe spin" : "Pause globe spin",
  );
  elements.pauseButton.setAttribute(
    "title",
    state.paused ? "Resume globe spin" : "Pause globe spin",
  );
  elements.pauseButton.innerHTML = state.paused
    ? '<i data-lucide="play"></i><span class="button-label">Spin</span>'
    : '<i data-lucide="pause"></i><span class="button-label">Spin</span>';
  renderIcons();
}

function renderIcons() {
  createIcons({ icons: iconSet });
}

function updateShotLog() {
  elements.shotLog.replaceChildren();

  const latest = [...state.shots].reverse().slice(0, MAX_LOG_ITEMS);

  for (const shot of latest) {
    const { lat, lon } = latLonFromVector(shot.local);
    const item = document.createElement("li");
    item.innerHTML = `
      <span class="shot-index">#${shot.id}</span>
      <span class="shot-mode">${shot.mode === "pilman" ? "P" : "F"}</span>
      <span>${lat.toFixed(1)} lat</span>
      <span>${lon.toFixed(1)} lon</span>
    `;
    elements.shotLog.append(item);
  }
}

function toggleAutoFire() {
  state.autoFire = !state.autoFire;
  state.lastAutoShotAt = state.elapsed - state.autoInterval;
  elements.autoButton.classList.toggle("is-running", state.autoFire);
  elements.autoButton.setAttribute(
    "aria-label",
    state.autoFire ? "Stop automatic firing" : "Start automatic firing",
  );
  elements.autoButton.setAttribute(
    "title",
    state.autoFire ? "Stop automatic firing" : "Auto fire",
  );
  elements.autoButton.innerHTML = state.autoFire
    ? '<i data-lucide="pause"></i><span class="button-label">Auto</span>'
    : '<i data-lucide="timer"></i><span class="button-label">Auto</span>';
  renderIcons();
}

function resetShots() {
  for (const shot of state.shots) {
    shot.marker.removeFromParent();
    markerMeshes.delete(shot.id);
  }

  state.shots = [];
  state.nextShotId = 1;
  elements.shotLog.replaceChildren();
  updateCurves();
  updateAllReadouts();
}

function exportShots() {
  const payload = {
    title: "Pilman Radiant simulation shots",
    exportedAt: new Date().toISOString(),
    spinAxis: getSpinAxis().toArray().map((value) => Number(value.toFixed(6))),
    angularSpeedDegPerSec: state.angularSpeedDeg,
    radiant: {
      yaw: state.radiantYaw,
      pitch: state.radiantPitch,
    },
    curveErrorDegrees: Number(curveErrorDegrees(getSpinAxis(), state.shots.map((shot) => shot.local)).toFixed(4)),
    shots: state.shots.map((shot) => serializeShot(
      shot.local,
      shot.mode,
      shot.elapsed,
      shot.angularSpeedRad,
    )),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "pilman-radiant-shots.json";
  link.click();
  URL.revokeObjectURL(url);
}

function resizeRenderer() {
  const rect = elements.canvas.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  const isPhone = width < 640;
  const isTablet = width >= 640 && width < 980;

  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.fov = isPhone ? 50 : isTablet ? 45 : 42;
  controls.minDistance = isPhone ? 5.3 : 4.4;
  controls.maxDistance = isPhone ? 11 : 9.5;

  if (camera.position.length() < controls.minDistance) {
    camera.position.setLength(controls.minDistance);
  }

  camera.updateProjectionMatrix();
}

function createGraticule(radius) {
  const group = new THREE.Group();
  const material = new THREE.LineBasicMaterial({
    color: 0xdaf7d6,
    transparent: true,
    opacity: 0.16,
  });

  for (let lat = -60; lat <= 60; lat += 30) {
    const latRad = THREE.MathUtils.degToRad(lat);
    const y = Math.sin(latRad) * radius;
    const ringRadius = Math.cos(latRad) * radius;
    const points = [];

    for (let index = 0; index <= 144; index += 1) {
      const theta = (index / 144) * Math.PI * 2;
      points.push(new THREE.Vector3(
        Math.cos(theta) * ringRadius,
        y,
        Math.sin(theta) * ringRadius,
      ));
    }

    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material));
  }

  for (let lon = 0; lon < 180; lon += 30) {
    const lonRad = THREE.MathUtils.degToRad(lon);
    const points = [];

    for (let index = 0; index <= 144; index += 1) {
      const theta = (index / 144) * Math.PI * 2;
      const x = Math.sin(theta) * Math.sin(lonRad) * radius;
      const y = Math.cos(theta) * radius;
      const z = Math.sin(theta) * Math.cos(lonRad) * radius;
      points.push(new THREE.Vector3(x, y, z));
    }

    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material));
  }

  return group;
}

function addStarfield() {
  const geometry = new THREE.BufferGeometry();
  const points = [];

  for (let index = 0; index < 850; index += 1) {
    const radius = THREE.MathUtils.randFloat(18, 44);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(THREE.MathUtils.randFloatSpread(2));
    points.push(
      radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.sin(theta),
    );
  }

  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  scene.add(new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      size: 0.028,
      color: 0xf6efdc,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
    }),
  ));
}

function createGlobeTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d");

  const ocean = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  ocean.addColorStop(0, "#0b201a");
  ocean.addColorStop(0.36, "#143c32");
  ocean.addColorStop(0.68, "#1a4d42");
  ocean.addColorStop(1, "#07110f");
  ctx.fillStyle = ocean;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawCloudedLand(ctx, canvas.width, canvas.height);
  drawFineTexture(ctx, canvas.width, canvas.height);
  drawTextureGrid(ctx, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 8;

  return texture;
}

function createBumpTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#66756b";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let index = 0; index < 560; index += 1) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const radius = THREE.MathUtils.randFloat(4, 34);
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, "rgba(225,232,206,0.55)");
    gradient.addColorStop(1, "rgba(12,22,18,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;

  return texture;
}

function drawCloudedLand(ctx, width, height) {
  const landPalette = ["#d6c56d", "#9db96b", "#c99655", "#efe3a6", "#7aa869"];

  for (let land = 0; land < 16; land += 1) {
    const centerX = ((land * 337) % width) + THREE.MathUtils.randFloat(-60, 60);
    const centerY = height * THREE.MathUtils.randFloat(0.17, 0.83);
    const lobes = THREE.MathUtils.randInt(9, 22);

    ctx.save();
    ctx.globalAlpha = THREE.MathUtils.randFloat(0.42, 0.78);
    ctx.fillStyle = landPalette[land % landPalette.length];
    ctx.beginPath();

    for (let index = 0; index <= lobes; index += 1) {
      const theta = (index / lobes) * Math.PI * 2;
      const radiusX = THREE.MathUtils.randFloat(60, 240);
      const radiusY = THREE.MathUtils.randFloat(28, 112);
      const wobble = 1 + Math.sin(theta * THREE.MathUtils.randFloat(1.2, 3.4) + land) * 0.22;
      const x = centerX + Math.cos(theta) * radiusX * wobble;
      const y = centerY + Math.sin(theta) * radiusY * wobble;

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function drawFineTexture(ctx, width, height) {
  for (let index = 0; index < 13000; index += 1) {
    const alpha = Math.random() * 0.08;
    ctx.fillStyle = `rgba(245, 239, 213, ${alpha})`;
    ctx.fillRect(Math.random() * width, Math.random() * height, 1, 1);
  }

  ctx.globalCompositeOperation = "multiply";
  for (let y = 0; y < height; y += 4) {
    ctx.fillStyle = `rgba(0, 0, 0, ${0.02 + Math.sin(y * 0.04) * 0.008})`;
    ctx.fillRect(0, y, width, 1);
  }
  ctx.globalCompositeOperation = "source-over";
}

function drawTextureGrid(ctx, width, height) {
  ctx.save();
  ctx.strokeStyle = "rgba(247, 238, 197, 0.09)";
  ctx.lineWidth = 1;

  for (let x = 0; x <= width; x += width / 24) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  for (let y = 0; y <= height; y += height / 12) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  ctx.restore();
}
