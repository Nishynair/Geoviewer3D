import { inspectGeoJSON } from 'spatial-doctor';
import type { SpatialDocument } from '../spatialDocument';
import {
  inspectJsonFg,
  JSON_FG_CORE_URI,
  type JsonFgInfo,
} from './jsonFg';

type JsonObject = Record<string, unknown>;

export interface ConversionAccount {
  preserved: string[];
  changed: string[];
  approximated: string[];
  lost: string[];
}

interface ConversionPlanBase {
  from: 'geojson' | 'jsonfg';
  to: 'geojson' | 'jsonfg';
  targetName: string;
}

export type SpatialConversionPlan =
  | (ConversionPlanBase & {
      status: 'ready';
      outputRawText: string;
      account: ConversionAccount;
    })
  | (ConversionPlanBase & {
      status: 'blocked';
      reason: string;
    });

const JSON_FG_RESERVED_MEMBERS = [
  'conformsTo',
  'coordRefSys',
  'place',
  'time',
  'measures',
  'featureType',
  'featureSchema',
  'links',
] as const;

const JSON_FG_FEATURE_MEMBERS = [
  'place',
  'time',
  'measures',
  'featureType',
  'featureSchema',
] as const;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(value: JsonObject, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function targetName(sourceName: string, to: SpatialConversionPlan['to']): string {
  const base = sourceName.replace(/\.(?:geojson|jsonfg|json-fg|json)$/i, '') || 'converted';
  return `${base}.${to === 'jsonfg' ? 'jsonfg' : 'geojson'}`;
}

function conversionBase(document: SpatialDocument): ConversionPlanBase {
  const to = document.format === 'geojson' ? 'jsonfg' : 'geojson';
  return {
    from: document.format,
    to,
    targetName: targetName(document.source.name, to),
  };
}

function sourceFailureReason(document: SpatialDocument): string | null {
  if (!document.parseError) return null;
  if (document.parseError.kind === 'json-syntax') {
    return `A JSON syntax error prevents conversion: ${document.parseError.message}`;
  }
  if (document.format === 'jsonfg') {
    return `This JSON-FG document cannot be converted: ${document.parseError.message}`;
  }
  return `This GeoJSON document cannot be converted because it is invalid: ${document.parseError.message}`;
}

function featuresOf(root: JsonObject): JsonObject[] {
  if (root.type === 'Feature') return [root];
  if (root.type !== 'FeatureCollection' || !Array.isArray(root.features)) return [];
  return root.features.filter(isObject);
}

function findJsonFgCollision(root: JsonObject): string | null {
  const locations: Array<{ object: JsonObject; path: string }> = [{ object: root, path: 'root' }];
  if (root.type === 'FeatureCollection' && Array.isArray(root.features)) {
    for (const [index, feature] of root.features.entries()) {
      if (isObject(feature)) locations.push({ object: feature, path: `Feature ${index + 1}` });
    }
  }

  for (const { object, path } of locations) {
    const member = JSON_FG_RESERVED_MEMBERS.find((key) => hasOwn(object, key));
    if (member) {
      return `The GeoJSON foreign member \`${member}\` at ${path} would gain JSON-FG meaning; this conversion will not reinterpret it.`;
    }
  }
  return null;
}

function ready(
  base: ConversionPlanBase,
  output: unknown,
  account: ConversionAccount,
): SpatialConversionPlan {
  return {
    ...base,
    status: 'ready',
    outputRawText: JSON.stringify(output, null, 2),
    account,
  };
}

function planGeoJSONToJsonFg(document: SpatialDocument): SpatialConversionPlan {
  const base = conversionBase(document);
  const failure = sourceFailureReason(document);
  if (failure) return { ...base, status: 'blocked', reason: failure };
  if (document.report?.valid !== true || !isObject(document.parsed)) {
    return { ...base, status: 'blocked', reason: 'Only valid GeoJSON can be converted.' };
  }
  if (document.parsed.type !== 'Feature' && document.parsed.type !== 'FeatureCollection') {
    return {
      ...base,
      status: 'blocked',
      reason: 'Only GeoJSON Feature and FeatureCollection roots are supported for JSON-FG conversion.',
    };
  }

  const collision = findJsonFgCollision(document.parsed);
  if (collision) return { ...base, status: 'blocked', reason: collision };

  const candidate = { ...document.parsed, conformsTo: [JSON_FG_CORE_URI] };
  const validation = inspectJsonFg(candidate, inspectGeoJSON);
  if (validation.status !== 'valid') {
    return {
      ...base,
      status: 'blocked',
      reason: `The generated JSON-FG Core candidate is not supported: ${validation.message}`,
    };
  }

  return ready(base, candidate, {
    preserved: [
      'Feature order, IDs, properties, and valid RFC 7946 geometry values are copied unchanged.',
      'Existing GeoJSON foreign members are retained without interpretation.',
      'Geometry keeps its RFC 7946 CRS84/CRS84h meaning; no CRS is inferred or applied.',
    ],
    changed: [
      'The document format changes from GeoJSON to JSON-FG by adding a root Core conformsTo declaration.',
      'The converted JSON is serialized with two-space indentation.',
    ],
    approximated: [],
    lost: [],
  });
}

function hasProfileRelation(link: unknown): boolean {
  return isObject(link) && link.rel === 'profile';
}

function removeProfileLinks(value: unknown): unknown {
  if (!isObject(value) || !Array.isArray(value.links)) return value;
  const projected = { ...value };
  const retainedLinks = value.links.filter((link) => !hasProfileRelation(link));
  if (retainedLinks.length === 0) delete projected.links;
  else projected.links = retainedLinks;
  return projected;
}

function extensionLosses(root: JsonObject): string[] {
  const losses: string[] = [];
  const rootMembers = JSON_FG_FEATURE_MEMBERS.filter((member) => hasOwn(root, member));
  for (const member of rootMembers) {
    losses.push(`The root ${member} member is removed from the GeoJSON output.`);
  }

  const features = root.type === 'Feature' ? [] : featuresOf(root);
  for (const [index, feature] of features.entries()) {
    const scope = root.type === 'Feature' ? 'Feature' : `Feature ${index + 1}`;
    for (const member of JSON_FG_FEATURE_MEMBERS) {
      if (!hasOwn(feature, member)) continue;
      losses.push(`The ${scope} ${member} member is removed from the GeoJSON output.`);
    }
  }
  return losses;
}

function jsonFgLosses(root: JsonObject, info: JsonFgInfo): string[] {
  const losses = [
    `The root conformsTo declaration is removed: ${info.conformanceClasses.join(', ')}.`,
    ...extensionLosses(root),
  ];
  if (info.coordRefSysDeclarations.length > 0) {
    const scopes = info.coordRefSysDeclarations.map(({ scope }) => scope).join(', ');
    losses.push(`coordRefSys declarations for native place and properties spatial values at ${scopes} are removed; no reprojection is performed.`);
  }
  for (const uri of info.profileUris) {
    losses.push(`The JSON-FG profile link ${uri} is removed.`);
  }
  return losses;
}

function planJsonFgToGeoJSON(document: SpatialDocument): SpatialConversionPlan {
  const base = conversionBase(document);
  const failure = sourceFailureReason(document);
  if (failure) return { ...base, status: 'blocked', reason: failure };
  if (document.report?.valid !== true) {
    return { ...base, status: 'blocked', reason: 'Only valid supported JSON-FG can be converted.' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(document.source.rawText);
  } catch {
    return { ...base, status: 'blocked', reason: 'The JSON-FG source text cannot be parsed.' };
  }
  if (!isObject(parsed)) {
    return { ...base, status: 'blocked', reason: 'The JSON-FG source root must be an object.' };
  }

  const adaptation = inspectJsonFg(parsed, inspectGeoJSON);
  if (adaptation.status !== 'valid') {
    return {
      ...base,
      status: 'blocked',
      reason: adaptation.status === 'unsupported'
        ? adaptation.message
        : `This JSON-FG document cannot be converted: ${adaptation.message}`,
    };
  }

  const output = removeProfileLinks(adaptation.geometryView);
  return ready(base, output, {
    preserved: [
      'Feature order, IDs, properties, and valid RFC 7946 geometry coordinates are preserved.',
      'Non-JSON-FG foreign members and non-profile links are copied unchanged.',
      'GeoJSON geometry remains CRS84 for XY and CRS84h for XYZ; no reprojection is applied.',
    ],
    changed: [
      'The document format changes from JSON-FG to GeoJSON.',
      'The converted JSON is serialized with two-space indentation.',
    ],
    approximated: [],
    lost: jsonFgLosses(parsed, adaptation.info),
  });
}

export function planSpatialConversion(document: SpatialDocument): SpatialConversionPlan {
  return document.format === 'geojson'
    ? planGeoJSONToJsonFg(document)
    : planJsonFgToGeoJSON(document);
}
