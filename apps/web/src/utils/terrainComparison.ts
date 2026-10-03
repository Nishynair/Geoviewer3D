export interface TerrainCoordinate {
  path: number[];
  longitude: number;
  latitude: number;
  sourceZ: number | null;
}

export interface TerrainComparisonRequest {
  requestId: number;
  geojson: import('geojson').GeoJSON;
  featureIndex: number;
  coordinates: TerrainCoordinate[];
}

export interface TerrainDifference {
  path: number[];
  longitude: number;
  latitude: number;
  sourceZ: number;
  terrainHeight: number;
  difference: number;
}

export type TerrainUnavailableReason =
  | 'no-elevation'
  | 'no-terrain'
  | 'sampling-failed'
  | 'no-sampled-heights'
  | 'numeric-range';

export type TerrainComparisonResult =
  | {
      status: 'unavailable';
      reason: TerrainUnavailableReason;
      totalCoordinates: number;
      coordinatesWithElevation: number;
      unavailableCoordinates: number;
      values: [];
    }
  | {
      status: 'complete' | 'partial';
      totalCoordinates: number;
      coordinatesWithElevation: number;
      unavailableCoordinates: number;
      values: TerrainDifference[];
    };

export type TerrainSampler = (
  points: readonly TerrainCoordinate[],
) => Promise<readonly (number | null | undefined)[]>;

function unavailable(
  reason: TerrainUnavailableReason,
  totalCoordinates: number,
  coordinatesWithElevation: number,
): TerrainComparisonResult {
  return {
    status: 'unavailable',
    reason,
    totalCoordinates,
    coordinatesWithElevation,
    unavailableCoordinates: totalCoordinates,
    values: [],
  };
}

/**
 * Compares raw GeoJSON Z values with actual terrain samples. No vertical
 * reference conversion is performed; a result is meaningful only when both
 * heights use compatible vertical references.
 */
export async function compareTerrainElevations(
  coordinates: readonly TerrainCoordinate[],
  sample: TerrainSampler,
  isCurrent: () => boolean = () => true,
): Promise<TerrainComparisonResult | null> {
  const eligible = coordinates.filter((point) =>
    Number.isFinite(point.longitude)
    && Number.isFinite(point.latitude)
    && point.sourceZ !== null
    && Number.isFinite(point.sourceZ),
  );
  if (eligible.length === 0) {
    return unavailable('no-elevation', coordinates.length, 0);
  }

  let sampled: readonly (number | null | undefined)[];
  try {
    sampled = await sample(eligible);
  } catch {
    return isCurrent()
      ? unavailable('sampling-failed', coordinates.length, eligible.length)
      : null;
  }
  if (!isCurrent()) return null;

  const values: TerrainDifference[] = [];
  let encounteredNumericRange = false;
  eligible.forEach((point, index) => {
    const terrainHeight = sampled[index];
    if (typeof terrainHeight !== 'number' || !Number.isFinite(terrainHeight)) return;
    const difference = point.sourceZ! - terrainHeight;
    if (!Number.isFinite(difference)) {
      encounteredNumericRange = true;
      return;
    }
    values.push({
      path: [...point.path],
      longitude: point.longitude,
      latitude: point.latitude,
      sourceZ: point.sourceZ!,
      terrainHeight,
      difference,
    });
  });

  const unavailableCoordinates = coordinates.length - values.length;
  if (values.length === 0) {
    return unavailable(
      encounteredNumericRange ? 'numeric-range' : 'no-sampled-heights',
      coordinates.length,
      eligible.length,
    );
  }

  return {
    status: unavailableCoordinates === 0 ? 'complete' : 'partial',
    totalCoordinates: coordinates.length,
    coordinatesWithElevation: eligible.length,
    unavailableCoordinates,
    values,
  };
}

export function unavailableTerrainComparison(
  reason: 'no-terrain',
  coordinates: readonly TerrainCoordinate[],
): TerrainComparisonResult {
  return unavailable(
    reason,
    coordinates.length,
    coordinates.filter((point) => point.sourceZ !== null && Number.isFinite(point.sourceZ)).length,
  );
}
