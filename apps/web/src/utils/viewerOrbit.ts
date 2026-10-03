export function getOrbitRadius(boundingSphereRadius: number): number | null {
  if (!Number.isFinite(boundingSphereRadius) || boundingSphereRadius <= 0) return null;
  const orbitRadius = boundingSphereRadius * 2;
  return Number.isFinite(orbitRadius) && orbitRadius > 0 ? orbitRadius : null;
}
