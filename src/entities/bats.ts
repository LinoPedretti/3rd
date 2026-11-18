import * as THREE from 'three';

export type BatId = 'neon_katana' | 'gravity_hammer' | 'void_scythe' | 'solar_bat';

export interface BatDefinition {
  id: BatId;
  name: string;
  tagline: string;
  description: string;
  cost: number;
  primaryHex: number;
  emissiveHex: number;
  cssColor: string;
  trailColorHex: number;
  sparkColorHex: number;
}

export const BAT_DEFINITIONS: BatDefinition[] = [
  {
    id: 'neon_katana',
    name: 'STEEL KATANA',
    tagline: 'FOLDED STEEL BLADE',
    description: 'Balanced martial katana with a clean silver wind-slash arc.',
    cost: 0,
    primaryHex: 0xdbe4eb,
    emissiveHex: 0x4a5568,
    cssColor: '#4a5568',
    trailColorHex: 0xffffff,
    sparkColorHex: 0xe2e8f0,
  },
  {
    id: 'gravity_hammer',
    name: 'IRON TETSUBO',
    tagline: 'HEAVY WAR MAUL',
    description: 'Massive ironbound war hammer with bronze impact plates.',
    cost: 0,
    primaryHex: 0x8c5a32,
    emissiveHex: 0x5c3a1e,
    cssColor: '#8c5a32',
    trailColorHex: 0xd69e2e,
    sparkColorHex: 0xecc94b,
  },
  {
    id: 'void_scythe',
    name: 'CRESCENT GLAIVE',
    tagline: 'CURVED POLEARM',
    description: 'Long-hafted temple glaive with a curved dark-steel crescent blade.',
    cost: 0,
    primaryHex: 0x5e4378,
    emissiveHex: 0x3b284d,
    cssColor: '#5e4378',
    trailColorHex: 0x9f7aea,
    sparkColorHex: 0xd6bcfa,
  },
  {
    id: 'solar_bat',
    name: 'OAKEN SLUGGER',
    tagline: 'BRASS-BOUND CLUB',
    description: 'Classic hardwood slugger bat banded in brass with a crisp metallic ping.',
    cost: 0,
    primaryHex: 0xb7791f,
    emissiveHex: 0x744210,
    cssColor: '#b7791f',
    trailColorHex: 0xf6e05e,
    sparkColorHex: 0xfefcbf,
  },
];

export function getBatDefinition(id: BatId): BatDefinition {
  return BAT_DEFINITIONS.find((b) => b.id === id) || BAT_DEFINITIONS[0];
}

export interface BatVisualRig {
  group: THREE.Group;
  slashRibbon: THREE.Mesh;
  slashMaterial: THREE.MeshBasicMaterial;
  emissiveParts: THREE.MeshStandardMaterial[];
}

/**
 * Builds the 3D weapon mesh and the 3D BufferGeometry ribbon slash arc mesh
 * using clean matte wood, steel, and bronze materials.
 */
export function createBatVisualRig(batId: BatId): BatVisualRig {
  const def = getBatDefinition(batId);
  const group = new THREE.Group();
  const emissiveParts: THREE.MeshStandardMaterial[] = [];

  const handleMat = new THREE.MeshStandardMaterial({
    color: 0x3b2f26,
    roughness: 0.75,
    metalness: 0.15,
    flatShading: true,
  });

  const bladeMat = new THREE.MeshStandardMaterial({
    color: def.primaryHex,
    roughness: 0.35,
    metalness: 0.65,
    flatShading: true,
  });
  emissiveParts.push(bladeMat);

  if (batId === 'neon_katana') {
    const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.34, 6), handleMat);
    hilt.position.y = 0.15;
    group.add(hilt);

    const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.03, 8), handleMat);
    guard.position.y = 0.33;
    group.add(guard);

    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.028, 1.18, 0.065), bladeMat);
    blade.position.set(0, 0.93, 0.01);
    group.add(blade);
  } else if (batId === 'gravity_hammer') {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.05, 1.18, 6), handleMat);
    shaft.position.y = 0.58;
    group.add(shaft);

    const headCore = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.34, 0.68), bladeMat);
    headCore.position.set(0, 1.18, 0);
    group.add(headCore);
  } else if (batId === 'void_scythe') {
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.044, 1.38, 6), handleMat);
    staff.position.y = 0.68;
    group.add(staff);

    for (let i = 0; i < 4; i++) {
      const seg = new THREE.Mesh(
        new THREE.BoxGeometry(0.03, 0.14 - i * 0.025, 0.28),
        bladeMat
      );
      seg.position.set(0, 1.32 - i * 0.08, 0.18 + i * 0.21);
      seg.rotation.x = 0.25 + i * 0.18;
      group.add(seg);
    }
  } else {
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.035, 0.42, 8), handleMat);
    grip.position.y = 0.23;
    group.add(grip);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.042, 0.88, 10), bladeMat);
    barrel.position.y = 0.88;
    group.add(barrel);
  }

  // Subtle, clean 3D Wind Slash Arc Mesh
  const arcSegments = 16;
  const innerR = 1.1;
  const outerR = 2.45;
  const startAngle = -Math.PI * 0.55;
  const endAngle = Math.PI * 0.55;

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= arcSegments; i++) {
    const t = i / arcSegments;
    const angle = THREE.MathUtils.lerp(startAngle, endAngle, t);
    const sinA = Math.sin(angle);
    const cosA = Math.cos(angle);

    positions.push(sinA * innerR, 0, cosA * innerR);
    uvs.push(t, 0);

    const tipTaper = Math.sin(t * Math.PI);
    const rOut = THREE.MathUtils.lerp(innerR + 0.15, outerR, tipTaper);
    positions.push(sinA * rOut, 0.05 * (t - 0.5), cosA * rOut);
    uvs.push(t, 1);

    if (i < arcSegments) {
      const base = i * 2;
      indices.push(base, base + 1, base + 2);
      indices.push(base + 1, base + 3, base + 2);
    }
  }

  const slashGeo = new THREE.BufferGeometry();
  slashGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  slashGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  slashGeo.setIndex(indices);
  slashGeo.computeVertexNormals();

  const slashMaterial = new THREE.MeshBasicMaterial({
    color: def.trailColorHex,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const slashRibbon = new THREE.Mesh(slashGeo, slashMaterial);
  slashRibbon.position.y = 1.15;
  slashRibbon.visible = false;

  return {
    group,
    slashRibbon,
    slashMaterial,
    emissiveParts,
  };
}
