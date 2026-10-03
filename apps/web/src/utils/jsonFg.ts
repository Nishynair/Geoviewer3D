import type { GeoJSON as GeoJsonValue } from 'geojson';
import type { InspectionReport } from 'spatial-doctor';

export const JSON_FG_CORE_URI = 'http://www.opengis.net/spec/json-fg-1/1.0/conf/core';
export const JSON_FG_CONFORMANCE_PREFIX = 'http://www.opengis.net/spec/json-fg-1/1.0/conf/';
export const JSON_FG_PROFILE_URI = 'http://www.opengis.net/def/profile/OGC/0/jsonfg';
export const JSON_FG_PLUS_PROFILE_URI = 'http://www.opengis.net/def/profile/OGC/0/jsonfg-plus';

const JSON_FG_EXTENSION_MEMBERS = [
  'place',
  'time',
  'measures',
  'featureType',
  'featureSchema',
] as const;

type JsonObject = Record<string, unknown>;
type InspectGeoJSON = (input: unknown) => InspectionReport;
type ValidInspectionReport = Extract<InspectionReport, { valid: true }>;
type InvalidInspectionReport = Extract<InspectionReport, { valid: false }>;

export interface JsonFgCoordinateReference {
  scope: string;
  value: unknown;
}

export interface JsonFgInfo {
  conformanceClasses: string[];
  profileUris: string[];
  coordRefSysDeclarations: JsonFgCoordinateReference[];
  geometryCrsDescription: string;
  unsupportedConstructs: string[];
}

export type JsonFgAdaptation =
  | {
      status: 'valid';
      geometryView: GeoJsonValue;
      report: ValidInspectionReport;
      info: JsonFgInfo;
    }
  | {
      status: 'invalid';
      message: string;
      report: InvalidInspectionReport | null;
      info: JsonFgInfo;
    }
  | {
      status: 'unsupported';
      message: string;
      info: JsonFgInfo;
    };

const JSON_FG_GEOMETRY_CRS =
  'RFC 7946 geometry uses CRS84 for XY and CRS84h for XYZ by default. coordRefSys applies to native place/properties spatial values, not this geometry member.';

export function emptyJsonFgInfo(): JsonFgInfo {
  return {
    conformanceClasses: [],
    profileUris: [],
    coordRefSysDeclarations: [],
    geometryCrsDescription: JSON_FG_GEOMETRY_CRS,
    unsupportedConstructs: [],
  };
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(value: JsonObject, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function profileLinks(value: unknown): string[] {
  if (!isObject(value) || !Array.isArray(value.links)) return [];
  return value.links.flatMap((link) =>
    isObject(link) && link.rel === 'profile' && typeof link.href === 'string'
      ? [link.href]
      : [],
  );
}

function jsonFgSpecificMember(value: JsonObject): boolean {
  return JSON_FG_EXTENSION_MEMBERS.some(
    (member) => member !== 'time' && hasOwn(value, member),
  );
}

function hasJsonFgSpecificFeatureMember(value: unknown): boolean {
  if (!isObject(value)) return false;
  if (jsonFgSpecificMember(value)) return true;
  return value.type === 'FeatureCollection'
    && Array.isArray(value.features)
    && value.features.some((feature) => isObject(feature) && jsonFgSpecificMember(feature));
}

export function isJsonFgCandidate(value: unknown): boolean {
  if (!isObject(value)) return false;
  const conformanceValues = Array.isArray(value.conformsTo)
    ? value.conformsTo
    : typeof value.conformsTo === 'string'
      ? [value.conformsTo]
      : [];
  if (conformanceValues.some((uri) => typeof uri === 'string' && uri.startsWith(JSON_FG_CONFORMANCE_PREFIX))) {
    return true;
  }
  if (profileLinks(value).some((uri) => uri === JSON_FG_PROFILE_URI || uri === JSON_FG_PLUS_PROFILE_URI)) {
    return true;
  }
  return hasJsonFgSpecificFeatureMember(value);
}

export function hasJsonFgSourceContext(name: string, rawText: string): boolean {
  if (/\.(?:jsonfg|json-fg)$/i.test(name)) return true;
  return rawText.includes('conformsTo') && rawText.includes(JSON_FG_CONFORMANCE_PREFIX);
}

function collectInfo(value: unknown): JsonFgInfo {
  const info = emptyJsonFgInfo();
  if (!isObject(value)) return info;

  const conformanceValues = Array.isArray(value.conformsTo) ? value.conformsTo : [];
  info.conformanceClasses = conformanceValues.filter((uri): uri is string => typeof uri === 'string');
  info.profileUris = profileLinks(value);

  if (hasOwn(value, 'coordRefSys')) {
    info.coordRefSysDeclarations.push({ scope: 'root', value: value.coordRefSys });
  }

  const features = value.type === 'FeatureCollection' && Array.isArray(value.features)
    ? value.features
    : value.type === 'Feature'
      ? [value]
      : [];

  for (const [index, featureValue] of features.entries()) {
    if (!isObject(featureValue)) continue;
    const scope = value.type === 'Feature' ? 'feature' : `feature ${index + 1}`;
    if (hasOwn(featureValue, 'coordRefSys') && featureValue !== value) {
      info.coordRefSysDeclarations.push({ scope, value: featureValue.coordRefSys });
    }
    for (const member of JSON_FG_EXTENSION_MEMBERS) {
      if (!hasOwn(featureValue, member)) continue;
      if (member === 'place' && featureValue.place === null) continue;
      const description = member === 'place'
        ? `Native place geometry at ${scope} is preserved in the JSON-FG source but is not rendered; only the GeoJSON geometry member is projected.`
        : `JSON-FG ${member} at ${scope} is preserved in the source but is not interpreted by this geometry inspector.`;
      info.unsupportedConstructs.push(description);
    }
  }

  for (const uri of info.conformanceClasses) {
    if (uri !== JSON_FG_CORE_URI) {
      info.unsupportedConstructs.push(`Additional JSON-FG conformance class is not interpreted: ${uri}`);
    }
  }
  for (const uri of info.profileUris) {
    if (uri !== JSON_FG_PROFILE_URI && uri !== JSON_FG_PLUS_PROFILE_URI) {
      info.unsupportedConstructs.push(`JSON-FG profile is not interpreted: ${uri}`);
    }
  }

  return info;
}

function isPlainGeoJsonGeometry(value: unknown): value is JsonObject {
  if (!isObject(value) || typeof value.type !== 'string') return false;
  return new Set([
    'Point',
    'MultiPoint',
    'LineString',
    'MultiLineString',
    'Polygon',
    'MultiPolygon',
    'GeometryCollection',
  ]).has(value.type);
}

function geometryMemberError(value: unknown, path: string): string | null {
  if (!isObject(value)) return null;
  for (const member of ['conformsTo', 'coordRefSys', 'measures']) {
    if (hasOwn(value, member)) {
      return `JSON-FG ${member} is not supported inside GeoJSON geometry at ${path}.`;
    }
  }
  if (value.type === 'GeometryCollection' && Array.isArray(value.geometries)) {
    for (const [index, child] of value.geometries.entries()) {
      const error = geometryMemberError(child, `${path}.geometries[${index}]`);
      if (error) return error;
    }
  }
  return null;
}

function stripFeatureExtensions(feature: JsonObject): JsonObject {
  const projected = { ...feature };
  for (const member of [
    'conformsTo',
    'coordRefSys',
    ...JSON_FG_EXTENSION_MEMBERS,
  ]) {
    delete projected[member];
  }
  return projected;
}

function createGeometryView(value: JsonObject): unknown {
  if (value.type === 'FeatureCollection') {
    if (!Array.isArray(value.features)) return { ...value };
    const projected = stripFeatureExtensions(value);
    projected.features = value.features.map((feature) =>
      isObject(feature) ? stripFeatureExtensions(feature) : feature,
    );
    return projected;
  }
  if (value.type === 'Feature') return stripFeatureExtensions(value);
  if (isPlainGeoJsonGeometry(value)) {
    const projected = { ...value };
    delete projected.conformsTo;
    return projected;
  }
  return value;
}

function invalid(
  info: JsonFgInfo,
  message: string,
  report: InvalidInspectionReport | null = null,
): JsonFgAdaptation {
  return { status: 'invalid', message, report, info };
}

export function inspectJsonFg(value: unknown, inspectGeoJSON: InspectGeoJSON): JsonFgAdaptation {
  const info = collectInfo(value);
  if (!isObject(value)) {
    return invalid(info, 'A JSON-FG document must have an object root.');
  }

  const type = value.type;
  if (type !== 'Feature' && type !== 'FeatureCollection') {
    return {
      status: 'unsupported',
      message: 'This viewer supports JSON-FG Feature and FeatureCollection roots with ordinary GeoJSON geometry. Other JSON-FG root types are not rendered.',
      info,
    };
  }

  if (!Array.isArray(value.conformsTo) || !value.conformsTo.every((uri) => typeof uri === 'string')) {
    return invalid(info, 'JSON-FG requires a root `conformsTo` array containing URI strings.');
  }
  if (!value.conformsTo.includes(JSON_FG_CORE_URI)) {
    return invalid(info, `The JSON-FG root conformsTo array must include the Core URI ${JSON_FG_CORE_URI}.`);
  }

  const profileUris = info.profileUris;
  const isJsonFgPlus = profileUris.includes(JSON_FG_PLUS_PROFILE_URI);
  const features = type === 'FeatureCollection'
    ? Array.isArray(value.features)
      ? value.features
      : null
    : [value];
  if (features === null) {
    return invalid(info, 'A JSON-FG FeatureCollection must have a `features` array.');
  }

  for (const [index, feature] of features.entries()) {
    const scope = type === 'Feature' ? 'root Feature' : `Feature ${index + 1}`;
    if (!isObject(feature) || feature.type !== 'Feature') {
      return invalid(info, `JSON-FG FeatureCollection item ${index + 1} must be a GeoJSON Feature.`);
    }
    if (feature !== value && hasOwn(feature, 'conformsTo')) {
      return invalid(info, 'The `conformsTo` member may appear only on the JSON-FG root object.');
    }
    if (hasOwn(feature, 'place') && feature.place !== null && isJsonFgPlus && feature.geometry == null) {
      return invalid(info, `JSON-FG Plus requires the geometry member to be non-null whenever ${scope} has a non-null place.`);
    }
    if (feature.geometry !== null) {
      const error = geometryMemberError(feature.geometry, `${scope}.geometry`);
      if (error) return invalid(info, error);
    }
  }

  const geometryView = createGeometryView(value);
  const report = inspectGeoJSON(geometryView);
  if (!report.valid) {
    return invalid(
      info,
      `The JSON-FG geometry view is not valid GeoJSON: ${report.diagnostics[0]?.message ?? 'the geometry structure is invalid.'}`,
      report,
    );
  }

  return {
    status: 'valid',
    geometryView: geometryView as GeoJsonValue,
    report,
    info,
  };
}
