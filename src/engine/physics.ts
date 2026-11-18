import * as THREE from 'three';

export interface CylinderObstacle {
  position: THREE.Vector3;
  radius: number;
  height: number;
}

export interface JumpPadVolume {
  position: THREE.Vector3;
  radius: number;
  boostVelocityY: number;
}

export interface PlatformSurface {
  position: THREE.Vector3;
  radius: number;
  topY: number;
}

export interface SweptHitResult {
  hit: boolean;
  t: number;
  point: THREE.Vector3;
  normal: THREE.Vector3;
}

const _seg = new THREE.Vector3();
const _toStart = new THREE.Vector3();
const _closest = new THREE.Vector3();

/**
 * Deterministic 3D swept sphere-segment vs target sphere/torso check.
 * Guarantees hyper-speed balls (even Mach 10+) never tunnel through fighters.
 */
export function sweptSphereVsSphere(
  startPos: THREE.Vector3,
  endPos: THREE.Vector3,
  radiusA: number,
  centerB: THREE.Vector3,
  radiusB: number,
  outResult: SweptHitResult
): boolean {
  const combinedRadius = radiusA + radiusB;
  const combinedRadiusSq = combinedRadius * combinedRadius;

  _seg.subVectors(endPos, startPos);
  const segLenSq = _seg.lengthSq();

  if (segLenSq < 1e-8) {
    const distSq = startPos.distanceToSquared(centerB);
    if (distSq <= combinedRadiusSq) {
      outResult.hit = true;
      outResult.t = 0;
      outResult.point.copy(startPos);
      outResult.normal.subVectors(startPos, centerB).normalize();
      return true;
    }
    outResult.hit = false;
    return false;
  }

  // Project centerB onto segment [startPos, endPos]
  _toStart.subVectors(centerB, startPos);
  const tProj = THREE.MathUtils.clamp(_toStart.dot(_seg) / segLenSq, 0, 1);
  _closest.copy(startPos).addScaledVector(_seg, tProj);

  const distSq = _closest.distanceToSquared(centerB);
  if (distSq <= combinedRadiusSq) {
    outResult.hit = true;
    outResult.t = tProj;
    outResult.point.copy(_closest);
    outResult.normal.subVectors(_closest, centerB);
    if (outResult.normal.lengthSq() < 1e-6) {
      outResult.normal.set(0, 1, 0);
    } else {
      outResult.normal.normalize();
    }
    return true;
  }

  outResult.hit = false;
  return false;
}

/**
 * Swept sphere vs vertical cylinder pillar obstacle (used in Twin Pillars & Reactor Core bumpers).
 */
export function sweptSphereVsCylinder(
  startPos: THREE.Vector3,
  endPos: THREE.Vector3,
  sphereRadius: number,
  cylinder: CylinderObstacle,
  outResult: SweptHitResult
): boolean {
  const minY = cylinder.position.y - sphereRadius;
  const maxY = cylinder.position.y + cylinder.height + sphereRadius;

  // Quick Y overlap check
  if (Math.max(startPos.y, endPos.y) < minY || Math.min(startPos.y, endPos.y) > maxY) {
    outResult.hit = false;
    return false;
  }

  const combinedR = sphereRadius + cylinder.radius;
  const combinedRSq = combinedR * combinedR;

  const dx = endPos.x - startPos.x;
  const dz = endPos.z - startPos.z;
  const lenSq = dx * dx + dz * dz;

  let t = 0;
  if (lenSq > 1e-8) {
    const toCx = cylinder.position.x - startPos.x;
    const toCz = cylinder.position.z - startPos.z;
    t = THREE.MathUtils.clamp((toCx * dx + toCz * dz) / lenSq, 0, 1);
  }

  const cx = startPos.x + dx * t;
  const cy = THREE.MathUtils.lerp(startPos.y, endPos.y, t);
  const cz = startPos.z + dz * t;

  if (cy < minY || cy > maxY) {
    outResult.hit = false;
    return false;
  }

  const nx = cx - cylinder.position.x;
  const nz = cz - cylinder.position.z;
  const distSq = nx * nx + nz * nz;

  if (distSq <= combinedRSq) {
    const dist = Math.sqrt(distSq) || 0.001;
    outResult.hit = true;
    outResult.t = t;
    outResult.normal.set(nx / dist, 0, nz / dist);
    outResult.point.set(
      cylinder.position.x + outResult.normal.x * combinedR,
      cy,
      cylinder.position.z + outResult.normal.z * combinedR
    );
    return true;
  }

  outResult.hit = false;
  return false;
}

/**
 * Push a fighter capsule horizontally out of cylindrical pillars and outer arena boundary.
 */
export function resolveFighterCollisions(
  pos: THREE.Vector3,
  vel: THREE.Vector3,
  fighterRadius: number,
  arenaRadius: number,
  obstacles: CylinderObstacle[],
  platforms: PlatformSurface[]
): { groundHeight: number } {
  let groundHeight = 0;

  // Elevated platforms (e.g., Reactor Core central dais)
  for (let i = 0; i < platforms.length; i++) {
    const plat = platforms[i];
    const dx = pos.x - plat.position.x;
    const dz = pos.z - plat.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist <= plat.radius + fighterRadius * 0.4) {
      if (pos.y >= plat.topY - 0.55) {
        groundHeight = Math.max(groundHeight, plat.topY);
      } else if (dist > 0.001) {
        // Side wall push-out
        const minR = plat.radius + fighterRadius;
        if (dist < minR) {
          const nx = dx / dist;
          const nz = dz / dist;
          pos.x = plat.position.x + nx * minR;
          pos.z = plat.position.z + nz * minR;
        }
      }
    }
  }

  // Pillars & Bumpers
  for (let i = 0; i < obstacles.length; i++) {
    const obs = obstacles[i];
    if (pos.y < obs.position.y + obs.height) {
      const dx = pos.x - obs.position.x;
      const dz = pos.z - obs.position.z;
      const dist = Math.hypot(dx, dz);
      const minR = obs.radius + fighterRadius;
      if (dist < minR && dist > 0.0001) {
        const nx = dx / dist;
        const nz = dz / dist;
        pos.x = obs.position.x + nx * minR;
        pos.z = obs.position.z + nz * minR;
        const dot = vel.x * nx + vel.z * nz;
        if (dot < 0) {
          vel.x -= dot * nx;
          vel.z -= dot * nz;
        }
      }
    }
  }

  // Outer arena perimeter wall
  const maxR = arenaRadius - fighterRadius;
  const rDist = Math.hypot(pos.x, pos.z);
  if (rDist > maxR && rDist > 0.0001) {
    const nx = pos.x / rDist;
    const nz = pos.z / rDist;
    pos.x = nx * maxR;
    pos.z = nz * maxR;
    const dot = vel.x * nx + vel.z * nz;
    if (dot > 0) {
      vel.x -= dot * nx;
      vel.z -= dot * nz;
    }
  }

  return { groundHeight };
}
