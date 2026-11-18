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
    name: 'NEON KATANA',
    tagline: 'CYBER-PLASMA EDGE',
    description: 'Sleek glowing cyan cyber-blade with a wide 3D plasma ribbon slash arc and electric sparks.',
    cost: 0,
    primaryHex: 0x00e5ff,
    emissiveHex: 0x00b8d4,
    cssColor: '#00e5ff',
    trailColorHex: 0x00f0ff,
    sparkColorHex: 0x80f8ff,
  },
  {
    id: 'gravity_hammer',
    name: 'GRAVITY HAMMER',
    tagline: 'HEAVY SEISMIC CRUSHER',
    description: 'Massive angular warhammer emitting heavy amber shockwave rings and ground-slam sparks.',
    cost: 250,
    primaryHex: 0xffab00,
    emissiveHex: 0xff6d00,
    cssColor: '#ffab00',
    trailColorHex: 0xff9100,
    sparkColorHex: 0xffe57f,
  },
  {
    id: 'void_scythe',
    name: 'VOID SCYTHE',
    tagline: 'SINGULARITY REAPER',
    description: 'Curved violet-black energy scythe leaving dark distortion ribbons and ultraviolet rifts.',
    cost: 400,
    primaryHex: 0xd500f9,
    emissiveHex: 0xaa00ff,
    cssColor: '#d500f9',
    trailColorHex: 0xb388ff,
    sparkColorHex: 0xea80fc,
  },
  {
    id: 'solar_bat',
    name: 'SOLAR BAT',
    tagline: 'ALL-STAR ALLOY SLUGGER',
    description: 'Classic metallic slugger bat with golden fire particles and a crisp metallic ping audio signature.',
    cost: 550,
    primaryHex: 0xffd740,
    emissiveHex: 0xffab00,
    cssColor: '#ffd740',
    trailColorHex: 0xffe57f,
    sparkColorHex: 0xffffff,
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
 * Builds the 3D weapon mesh and the 3D BufferGeometry ribbon slash arc mesh.
 */
export function createBatVisualRig(batId: BatId): BatVisualRig {
  const def = getBatDefinition(batId);
  const group = new THREE.Group();
  const emissiveParts: THREE.MeshStandardMaterial[] = [];

  const handleMat = new THREE.MeshStandardMaterial({
    color: 0x1a2234,
    roughness: 0.4,
    metalness: 0.8,
    flatShading: true,
  });

  const glowMat = new THREE.MeshStandardMaterial({
    color: def.primaryHex,
    emissive: def.emissiveHex,
    emissiveIntensity: 2.2,
    roughness: 0.2,
    metalness: 0.5,
    flatShading: true,
  });
  emissiveParts.push(glowMat);

  if (batId === 'neon_katana') {
    // Hilt
    const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.34, 6), handleMat);
    hilt.position.y = 0.15;
    group.add(hilt);

    // Hexagonal Tsuba Guard
    const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.03, 6), glowMat);
    guard.position.y = 0.33;
    group.add(guard);

    // Sleek Blade core + glowing plasma edge
    const spine = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.15, 0.06), handleMat);
    spine.position.set(0, 0.92, -0.01);
    group.add(spine);

    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.018, 1.18, 0.045), glowMat);
    edge.position.set(0, 0.93, 0.03);
    group.add(edge);
  } else if (batId === 'gravity_hammer') {
    // Heavy Shaft
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.05, 1.18, 6), handleMat);
    shaft.position.y = 0.58;
    group.add(shaft);

    // Massive Angular Warhammer Head
    const headCore = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.34, 0.72), handleMat);
    headCore.position.set(0, 1.18, 0);
    group.add(headCore);

    // Glowing Amber Impact Plates
    const faceFront = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.12, 6), glowMat);
    faceFront.rotation.x = Math.PI * 0.5;
    faceFront.position.set(0, 1.18, 0.38);
    group.add(faceFront);

    const faceBack = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.12, 6), glowMat);
    faceBack.rotation.x = -Math.PI * 0.5;
    faceBack.position.set(0, 1.18, -0.38);
    group.add(faceBack);
  } else if (batId === 'void_scythe') {
    // Long Curved Snath Staff
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.044, 1.38, 6), handleMat);
    staff.position.y = 0.68;
    group.add(staff);

    // Energy Collar
    const collar = new THREE.Mesh(new THREE.OctahedronGeometry(0.12, 0), glowMat);
    collar.position.set(0, 1.32, 0);
    group.add(collar);

    // Curved Crescent Scythe Blade segments
    for (let i = 0; i < 4; i++) {
      const seg = new THREE.Mesh(
        new THREE.BoxGeometry(0.03, 0.14 - i * 0.025, 0.28),
        glowMat
      );
      seg.position.set(0, 1.32 - i * 0.08, 0.18 + i * 0.21);
      seg.rotation.x = 0.25 + i * 0.18;
      group.add(seg);
    }
  } else {
    // Solar Bat — Metallic Slugger
    const metalMat = new THREE.MeshStandardMaterial({
      color: 0xfff3c4,
      emissive: 0xffab00,
      emissiveIntensity: 0.9,
      roughness: 0.15,
      metalness: 0.95,
      flatShading: true,
    });
    emissiveParts.push(metalMat);

    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.04, 8), handleMat);
    knob.position.y = 0.02;
    group.add(knob);

    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.035, 0.42, 8), handleMat);
    grip.position.y = 0.23;
    group.add(grip);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.042, 0.88, 10), metalMat);
    barrel.position.y = 0.88;
    group.add(barrel);

    const solarRing = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.018, 6, 12), glowMat);
    solarRing.rotation.x = Math.PI * 0.5;
    solarRing.position.y = 1.12;
    group.add(solarRing);
  }

  // Wide 3D Ribbon Slash Arc Mesh (BufferGeometry fan in XZ plane around fighter torso)
  const arcSegments = 18;
  const innerR = 1.05;
  const outerR = 2.65;
  const startAngle = -Math.PI * 0.65;
  const endAngle = Math.PI * 0.65;

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= arcSegments; i++) {
    const t = i / arcSegments;
    const angle = THREE.MathUtils.lerp(startAngle, endAngle, t);
    const sinA = Math.sin(angle);
    const cosA = Math.cos(angle);

    // Inner vertex
    positions.push(sinA * innerR, 0, cosA * innerR);
    uvs.push(t, 0);

    // Outer vertex (slightly tapered at ends)
    const tipTaper = Math.sin(t * Math.PI);
    const rOut = THREE.MathUtils.lerp(innerR + 0.2, outerR, tipTaper);
    positions.push(sinA * rOut, 0.08 * (t - 0.5), cosA * rOut);
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
    blending: THREE.AdditiveBlending,
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
