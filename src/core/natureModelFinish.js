// Some shipped shrubs use a named leaf material instead of a Colorable slot.
// Tint that material without replacing its texture or affecting tree trunks.
export function finishNatureModelMaterial(material, role, color, variant, barkColor) {
  // Tree 11 has a solid rounded crown, but its authored decorative pattern does not
  // belong in the natural grove. Retain the mesh and apply separate leaf/bark colors.
  // This is called only for natural scenes and never for uploaded custom models.
  if (role === 'tree' && variant === 11 && ['Colorable_1', 'Colorable_2'].includes(material.name)) {
    material.map = null;
    material.color.set(material.name === 'Colorable_1' ? color || '#3f805c' : barkColor || '#725641');
    material.needsUpdate = true;
  }
  if (role === 'plant' && material.name.startsWith('Leaves_') && color) material.color.set(color);
  material.emissive?.set('#000000');
  material.emissiveIntensity = 0;
  if (['tree', 'plant', 'rock', 'landmark', 'cliff'].includes(role)) {
    material.roughness = 0.92;
    material.metalness = 0;
  }
}
