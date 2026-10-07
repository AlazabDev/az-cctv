import type { CameraSpec, PlacedDevice } from "./types";
import { ppmAtDistance, ppmLevels } from "./geometry";

/** Tilt is measured downward from the horizontal; target lies on the floor. */
export function cameraDeployment(device: Pick<PlacedDevice, "heightM" | "tilt">, spec: CameraSpec) {
  const height = Math.max(0.1, device.heightM);
  const tilt = Math.min(89.9, Math.max(0, device.tilt));
  const vfov = 2 * Math.atan(Math.tan(spec.hfov * Math.PI / 360) * spec.vres / spec.hres) * 180 / Math.PI;
  const distance = tilt > 0 ? height / Math.tan(tilt * Math.PI / 180) : Infinity;
  const lower = Math.min(89.9, tilt + vfov / 2);
  const upper = tilt - vfov / 2;
  const near = height / Math.tan(lower * Math.PI / 180);
  const far = upper > 0 ? height / Math.tan(upper * Math.PI / 180) : Infinity;
  const ppm = Number.isFinite(distance) ? ppmAtDistance(spec, distance) : 0;
  const dori = ppmLevels.find((level) => ppm >= level.ppm);
  return { vfov, distance, near, far, ppm, dori };
}

export function aimCameraAt(device: Pick<PlacedDevice, "x" | "y" | "heightM">, target: { x: number; y: number }, pxPerMeter: number) {
  const dx = target.x - device.x;
  const dy = target.y - device.y;
  const distance = Math.max(0.01, Math.hypot(dx, dy) / Math.max(0.01, pxPerMeter));
  return { rotation: Math.atan2(dy, dx) * 180 / Math.PI, tilt: Math.min(89.9, Math.atan2(Math.max(0.1, device.heightM), distance) * 180 / Math.PI) };
}