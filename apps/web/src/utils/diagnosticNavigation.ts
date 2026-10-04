import type { GeoJSON as GeoJSONValue, Feature } from 'geojson';
import type { Diagnostic } from '@nish-andran/spatial-doctor';

export const FEATURE_INDEX_PROPERTY = '__geoviewer3dFeatureIndex';

export interface SourceTextLocation {
  /** Zero-based UTF-16 offset, matching Monaco's model offsets. */
  start: number;
  /** Exclusive zero-based UTF-16 offset, matching Monaco's model offsets. */
  end: number;
}

export interface IndexedViewerValue {
  geojson: GeoJSONValue;
  featureIndexProperty: string | null;
}

export interface DiagnosticNavigationPlan<T = unknown> {
  featureIndex: number | null;
  entities: T[];
  sourceLocation: SourceTextLocation | null;
}

export interface DiagnosticFeatureFocusActions<T> {
  highlight(entities: T[]): void;
  flyTo(entities: T[]): void;
}

export type FeaturePropertiesReader<T> = (entity: T) => Record<string, unknown> | undefined;

export interface DiagnosticReference {
  code?: string;
  featureId?: string | number;
  featureIndex?: number;
  coordinatePath?: number[];
  sourceLocation?: SourceTextLocation;
}

function documentFeatures(geojson: GeoJSONValue): Feature[] {
  if (geojson.type === 'FeatureCollection') return geojson.features;
  if (geojson.type === 'Feature') return [geojson];
  return [];
}

export function getGeoJSONFeature(
  geojson: GeoJSONValue | null,
  featureIndex: number,
): Feature | null {
  if (geojson === null || !Number.isSafeInteger(featureIndex) || featureIndex < 0) return null;
  return documentFeatures(geojson)[featureIndex] ?? null;
}

export function getFeatureIndexFromProperties(
  properties: Record<string, unknown> | undefined,
  featureIndexProperty: string | null,
): number | null {
  if (!properties || !featureIndexProperty) return null;
  const featureIndex = properties[featureIndexProperty];
  return Number.isSafeInteger(featureIndex) && (featureIndex as number) >= 0
    ? featureIndex as number
    : null;
}

export function isValidSourceLocation(value: unknown): value is SourceTextLocation {
  if (typeof value !== 'object' || value === null) return false;
  const location = value as Partial<SourceTextLocation>;
  return Number.isSafeInteger(location.start)
    && Number.isSafeInteger(location.end)
    && location.start! >= 0
    && location.end! >= location.start!;
}

export function hasDiagnosticFeatureReference(
  diagnostic: DiagnosticReference,
  geojson: GeoJSONValue | null,
): boolean {
  return resolveDiagnosticFeatureIndex(geojson, diagnostic) !== null;
}

export function hasDiagnosticSourceLocation(
  diagnostic: DiagnosticReference,
  sourceTextLength: number,
): boolean {
  return isValidSourceLocation(diagnostic.sourceLocation)
    && diagnostic.sourceLocation.end <= sourceTextLength;
}

export function resolveDiagnosticFeatureIndex(
  geojson: GeoJSONValue | null,
  diagnostic: DiagnosticReference,
): number | null {
  if (geojson === null) return null;
  const features = documentFeatures(geojson);
  if (features.length === 0) return null;

  if (diagnostic.featureIndex !== undefined) {
    const index = diagnostic.featureIndex;
    if (!Number.isSafeInteger(index) || index < 0 || index >= features.length) return null;
    if (diagnostic.featureId !== undefined && features[index]?.id !== diagnostic.featureId) {
      return null;
    }
    return index;
  }

  if (diagnostic.featureId === undefined) return null;
  const matches: number[] = [];
  features.forEach((feature, index) => {
    if (feature.id === diagnostic.featureId) matches.push(index);
  });
  return matches.length === 1 ? matches[0]! : null;
}

export function indexFeaturesForViewer(geojson: GeoJSONValue): IndexedViewerValue {
  // The canonical document remains untouched; Cesium receives this indexed copy.
  const viewerGeoJSON = JSON.parse(JSON.stringify(geojson)) as GeoJSONValue;
  const features = documentFeatures(viewerGeoJSON);
  if (features.length === 0) {
    return { geojson: viewerGeoJSON, featureIndexProperty: null };
  }

  const propertyNames = new Set<string>();
  for (const feature of features) {
    if (feature.properties && typeof feature.properties === 'object') {
      for (const key of Object.keys(feature.properties)) propertyNames.add(key);
    }
  }

  let propertyName = FEATURE_INDEX_PROPERTY;
  while (propertyNames.has(propertyName)) propertyName += '_';

  features.forEach((feature, featureIndex) => {
    feature.properties = {
      ...(feature.properties ?? {}),
      [propertyName]: featureIndex,
    };
  });

  return { geojson: viewerGeoJSON, featureIndexProperty: propertyName };
}

export function findFeatureEntities<T>(
  entities: readonly T[],
  featureIndex: number,
  featureIndexProperty: string,
  readProperties: FeaturePropertiesReader<T>,
): T[] {
  return entities.filter((entity) => {
    const values = readProperties(entity);
    return values?.[featureIndexProperty] === featureIndex;
  });
}

export function isCurrentLoadedGeoJSON(
  currentGeoJSON: GeoJSONValue | null,
  loadedGeoJSON: GeoJSONValue,
): boolean {
  return currentGeoJSON !== null && currentGeoJSON === loadedGeoJSON;
}

export function findCurrentFeatureEntities<T>(
  currentGeoJSON: GeoJSONValue | null,
  loadedGeoJSON: GeoJSONValue,
  entities: readonly T[],
  featureIndex: number | null,
  featureIndexProperty: string | null,
  readProperties: FeaturePropertiesReader<T>,
): T[] {
  if (!isCurrentLoadedGeoJSON(currentGeoJSON, loadedGeoJSON)
      || featureIndex === null
      || featureIndexProperty === null
      || resolveDiagnosticFeatureIndex(currentGeoJSON, { featureIndex }) === null) {
    return [];
  }

  return findFeatureEntities(entities, featureIndex, featureIndexProperty, readProperties);
}

export function createDiagnosticNavigationPlan<T>(
  diagnostic: DiagnosticReference,
  geojson: GeoJSONValue | null,
  entities: readonly T[],
  readProperties: FeaturePropertiesReader<T>,
  featureIndexProperty = FEATURE_INDEX_PROPERTY,
): DiagnosticNavigationPlan<T> {
  const featureIndex = resolveDiagnosticFeatureIndex(geojson, diagnostic);
  return {
    featureIndex,
    entities: featureIndex === null
      ? []
      : findFeatureEntities(entities, featureIndex, featureIndexProperty, readProperties),
    sourceLocation: isValidSourceLocation(diagnostic.sourceLocation)
      ? diagnostic.sourceLocation
      : null,
  };
}

export function focusDiagnosticFeature<T>(
  plan: DiagnosticNavigationPlan<T>,
  actions: DiagnosticFeatureFocusActions<T>,
): boolean {
  if (plan.entities.length === 0) return false;
  actions.highlight(plan.entities);
  actions.flyTo(plan.entities);
  return true;
}
