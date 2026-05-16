import * as THREE from "three";

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const UP = new THREE.Vector3(0, 1, 0);

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function spinAxisFromAngles(tiltDeg, azimuthDeg) {
  const tilt = tiltDeg * DEG_TO_RAD;
  const azimuth = azimuthDeg * DEG_TO_RAD;

  return new THREE.Vector3(
    Math.sin(tilt) * Math.cos(azimuth),
    Math.cos(tilt),
    Math.sin(tilt) * Math.sin(azimuth),
  ).normalize();
}

export function directionFromYawPitch(yawDeg, pitchDeg) {
  const yaw = yawDeg * DEG_TO_RAD;
  const pitch = pitchDeg * DEG_TO_RAD;
  const horizontal = Math.cos(pitch);

  return new THREE.Vector3(
    horizontal * Math.sin(yaw),
    Math.sin(pitch),
    horizontal * Math.cos(yaw),
  ).normalize();
}

export function orientationAt(axis, angularSpeedRad, elapsedSeconds) {
  return new THREE.Quaternion().setFromAxisAngle(axis, angularSpeedRad * elapsedSeconds);
}

export function worldSurfaceToLocal(worldSurfacePoint, orientation) {
  return worldSurfacePoint
    .clone()
    .normalize()
    .applyQuaternion(orientation.clone().invert())
    .normalize();
}

export function localSurfaceToWorld(localSurfacePoint, orientation) {
  return localSurfacePoint.clone().normalize().applyQuaternion(orientation).normalize();
}

export function latLonFromVector(vector) {
  const local = vector.clone().normalize();

  return {
    lat: Math.asin(clamp(local.y, -1, 1)) * RAD_TO_DEG,
    lon: Math.atan2(local.x, local.z) * RAD_TO_DEG,
  };
}

export function vectorFromLatLon(latDeg, lonDeg) {
  const lat = latDeg * DEG_TO_RAD;
  const lon = lonDeg * DEG_TO_RAD;
  const horizontal = Math.cos(lat);

  return new THREE.Vector3(
    horizontal * Math.sin(lon),
    Math.sin(lat),
    horizontal * Math.cos(lon),
  ).normalize();
}

export function smallCirclePoints(axis, constant, segments = 256) {
  const normalizedAxis = axis.clone().normalize();
  const c = clamp(constant, -0.999, 0.999);
  const radius = Math.sqrt(1 - c * c);
  const reference = Math.abs(normalizedAxis.dot(UP)) > 0.96
    ? new THREE.Vector3(1, 0, 0)
    : UP.clone();
  const tangentA = new THREE.Vector3().crossVectors(normalizedAxis, reference).normalize();
  const tangentB = new THREE.Vector3().crossVectors(normalizedAxis, tangentA).normalize();
  const center = normalizedAxis.clone().multiplyScalar(c);
  const points = [];

  for (let i = 0; i <= segments; i += 1) {
    const theta = (i / segments) * Math.PI * 2;
    const point = center
      .clone()
      .add(tangentA.clone().multiplyScalar(Math.cos(theta) * radius))
      .add(tangentB.clone().multiplyScalar(Math.sin(theta) * radius))
      .normalize();

    points.push(point);
  }

  return points;
}

export function sphericalTracePoints(localVectors, samplesPerSegment = 18) {
  if (localVectors.length < 2) {
    return [];
  }

  const points = [];

  for (let index = 0; index < localVectors.length - 1; index += 1) {
    const start = localVectors[index].clone().normalize();
    const end = localVectors[index + 1].clone().normalize();
    const dot = clamp(start.dot(end), -1, 1);
    const omega = Math.acos(dot);

    for (let step = 0; step < samplesPerSegment; step += 1) {
      const t = step / samplesPerSegment;
      let point;

      if (omega < 0.0001) {
        point = start.clone();
      } else {
        const sinOmega = Math.sin(omega);
        const a = Math.sin((1 - t) * omega) / sinOmega;
        const b = Math.sin(t * omega) / sinOmega;
        point = start.clone().multiplyScalar(a).add(end.clone().multiplyScalar(b));
      }

      points.push(point.normalize());
    }
  }

  points.push(localVectors[localVectors.length - 1].clone().normalize());
  return points;
}

export function fittedSmallCircleConstant(axis, localVectors, fallbackConstant) {
  if (localVectors.length === 0) {
    return clamp(fallbackConstant, -0.999, 0.999);
  }

  const normalizedAxis = axis.clone().normalize();
  const mean = localVectors.reduce((sum, point) => sum + normalizedAxis.dot(point), 0) / localVectors.length;

  return clamp(mean, -0.999, 0.999);
}

export function curveErrorDegrees(axis, localVectors) {
  if (localVectors.length < 2) {
    return 0;
  }

  const normalizedAxis = axis.clone().normalize();
  const constant = fittedSmallCircleConstant(normalizedAxis, localVectors, 0);
  const variance = localVectors.reduce((sum, point) => {
    const delta = normalizedAxis.dot(point) - constant;
    return sum + delta * delta;
  }, 0) / localVectors.length;

  return Math.asin(clamp(Math.sqrt(variance), 0, 1)) * RAD_TO_DEG;
}

export function serializeShot(vector, mode, elapsedSeconds, angularSpeedRad) {
  const { lat, lon } = latLonFromVector(vector);

  return {
    mode,
    t: Number(elapsedSeconds.toFixed(3)),
    angularSpeedDegPerSec: Number((angularSpeedRad * RAD_TO_DEG).toFixed(3)),
    local: vector.toArray().map((value) => Number(value.toFixed(6))),
    latitude: Number(lat.toFixed(3)),
    longitude: Number(lon.toFixed(3)),
  };
}
