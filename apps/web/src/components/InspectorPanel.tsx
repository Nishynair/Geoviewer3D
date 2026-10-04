import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { useMemo } from 'react';
import {
  inspectGeoJSON,
  measureGeoJSONGeometry,
  type Diagnostic,
  type DistanceSummary,
} from 'spatial-doctor';
import type { Geometry, GeoJSON as GeoJsonValue } from 'geojson';
import type { SpatialDocument } from '../spatialDocument';
import type { JsonFgInfo } from '../utils/jsonFg';
import {
  hasDiagnosticFeatureReference,
  resolveDiagnosticFeatureIndex,
} from '../utils/diagnosticNavigation';
import { getGeoJSONFeature } from '../utils/diagnosticNavigation';
import { resolveDiagnosticSourceLocation } from '../utils/featureSourceLocation';
import type { GeoJSONRepairKind, GeoJSONRepairPreview } from '../utils/geoJsonRepairs';
import type { TerrainComparisonResult } from '../utils/terrainComparison';
import { planSpatialConversion, type ConversionAccount, type SpatialConversionPlan } from '../utils/formatConversion';

interface InspectorPanelProps {
  document: SpatialDocument;
  onSelectDiagnostic?: (diagnostic: Diagnostic) => void;
  onShowFeatureSource?: () => void;
  selectedFeatureIndex?: number | null;
  selectedFeatureHasSourceLocation?: boolean;
  onCompareTerrain?: () => void;
  terrainComparisonPending?: boolean;
  terrainComparison?: TerrainComparisonResult | null;
  repairPreview?: GeoJSONRepairPreview | null;
  canUndoRepair?: boolean;
  onPreviewRepair?: (kind: GeoJSONRepairKind) => void;
  onApplyRepair?: () => void;
  onUndoRepair?: () => void;
}

const DIAGNOSTIC_DEFINITIONS: Record<Diagnostic['code'], { title: string }> = {
  'invalid-geojson': {
    title: 'Invalid GeoJSON',
  },
  'duplicate-consecutive-position': {
    title: 'Duplicate consecutive positions',
  },
  'mixed-coordinate-dimensions': {
    title: 'Mixed XY and XYZ dimensions',
  },
  'coordinate-out-of-range': {
    title: 'Longitude or latitude out of range',
  },
  'unclosed-polygon-ring': {
    title: 'Unclosed polygon ring',
  },
  'excess-coordinate-precision': {
    title: 'High coordinate precision',
  },
};

const REPAIR_OPTIONS: Array<{ kind: GeoJSONRepairKind; label: string }> = [
  { kind: 'remove-duplicate-vertices', label: 'Remove consecutive duplicate vertices' },
  { kind: 'close-unclosed-rings', label: 'Close safe unclosed polygon rings' },
  { kind: 'remove-z', label: 'Remove Z from XYZ coordinates' },
];

function GeometryRepairs({
  preview,
  canUndo,
  onPreview,
  onApply,
  onUndo,
}: {
  preview: GeoJSONRepairPreview | null;
  canUndo: boolean;
  onPreview?: (kind: GeoJSONRepairKind) => void;
  onApply?: () => void;
  onUndo?: () => void;
}) {
  if (!onPreview) return null;

  return (
    <Box component="section" aria-labelledby="geometry-repairs-heading" sx={{ mt: 2 }}>
      <Typography id="geometry-repairs-heading" component="h3" variant="subtitle1">
        Geometry repairs
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
        Preview a conservative repair first. The source changes only when you apply it.
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', mt: 0.75 }}>
        {REPAIR_OPTIONS.map(({ kind, label }) => (
          <Button key={kind} size="small" onClick={() => onPreview(kind)}>
            {label}
          </Button>
        ))}
      </Box>

      {preview?.status === 'unavailable' && (
        <Alert severity="info" role="status" sx={{ mt: 1 }}>
          {preview.reason}
        </Alert>
      )}
      {preview?.status === 'ready' && (
        <Box role="status" sx={{ mt: 1 }}>
          <Typography component="h4" variant="body2" sx={{ fontWeight: 600 }}>
            Repair preview
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.5 }}>
            Coordinate positions: {preview.measurements.coordinatePositionsBefore} → {preview.measurements.coordinatePositionsAfter}
          </Typography>
          {preview.kind === 'remove-duplicate-vertices' && (
            <Typography variant="body2">
              Consecutive duplicate vertices removed: {preview.measurements.duplicatePositionsRemoved}
            </Typography>
          )}
          {preview.kind === 'close-unclosed-rings' && (
            <Typography variant="body2">
              Polygon rings closed: {preview.measurements.ringsClosed}
            </Typography>
          )}
          {preview.kind === 'remove-z' && (
            <Typography variant="body2">
              Z ordinates removed: {preview.measurements.zOrdinatesRemoved}; 3D bounding-box ranges removed: {preview.measurements.bboxZRangesRemoved}
            </Typography>
          )}
          <details>
            <summary>View proposed GeoJSON</summary>
            <Box
              component="pre"
              aria-label="Proposed GeoJSON repair output"
              sx={{ maxHeight: 240, overflow: 'auto', p: 1, bgcolor: 'action.hover', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
            >
              {preview.outputRawText}
            </Box>
          </details>
          {onApply && (
            <Button size="small" variant="contained" sx={{ mt: 1 }} onClick={onApply}>
              Apply repair
            </Button>
          )}
        </Box>
      )}

      {canUndo && onUndo && (
        <Button size="small" sx={{ mt: 1 }} onClick={onUndo}>
          Undo repair
        </Button>
      )}
    </Box>
  );
}

function JsonFgDetails({ info }: { info: JsonFgInfo }) {
  const hasUnsupported = info.unsupportedConstructs.length > 0;
  return (
    <Box component="section" aria-labelledby="jsonfg-details-heading" sx={{ mt: 2 }}>
      <Alert severity={hasUnsupported ? 'warning' : 'info'}>
        <Typography id="jsonfg-details-heading" component="h3" variant="subtitle1">
          JSON-FG source · Core geometry subset
        </Typography>
        <Typography component="p" variant="body2" sx={{ mb: 0, mt: 0.5 }}>
          The original JSON-FG source is preserved. These inspection metrics and the globe use only the standard GeoJSON geometry member; they do not validate every JSON-FG extension.
        </Typography>
      </Alert>
      <Typography variant="body2" sx={{ mt: 1 }}>
        Geometry CRS: {info.geometryCrsDescription}
      </Typography>
      {info.coordRefSysDeclarations.length > 0 ? (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
            coordRefSys values apply to native place and properties spatial values, inherit from the root unless overridden, and do not change the GeoJSON geometry member.
          </Typography>
          <Box component="ul" aria-label="JSON-FG coordinate reference declarations" sx={{ listStyle: 'none', p: 0, m: 0, mt: 0.5 }}>
            {info.coordRefSysDeclarations.map(({ scope, value }, index) => (
              <Box component="li" key={`${scope}-${index}`} sx={{ py: 0.25, overflowWrap: 'anywhere' }}>
                <Typography variant="body2">{scope} coordRefSys: {JSON.stringify(value)}</Typography>
              </Box>
            ))}
          </Box>
        </>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
          No coordRefSys value is declared for native place or properties spatial values.
        </Typography>
      )}
      {info.profileUris.length > 0 && (
        <Box sx={{ mt: 0.75 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>Profile links</Typography>
          {info.profileUris.map((uri, index) => (
            <Typography key={`${uri}-${index}`} variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
              {uri}
            </Typography>
          ))}
        </Box>
      )}
      {hasUnsupported && (
        <Box component="ul" aria-label="Unsupported JSON-FG constructs" sx={{ pl: 2.5, mb: 0 }}>
          {info.unsupportedConstructs.map((construct, index) => (
            <Typography component="li" key={`${construct}-${index}`} variant="body2">
              {construct}
            </Typography>
          ))}
        </Box>
      )}
    </Box>
  );
}

function downloadConvertedFile(plan: Extract<SpatialConversionPlan, { status: 'ready' }>) {
  const blob = new Blob([plan.outputRawText], { type: 'application/json' });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = plan.targetName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

function ConversionAccountSection({ account }: { account: ConversionAccount }) {
  const groups: Array<{ title: string; items: string[] }> = [
    { title: 'Preserved', items: account.preserved },
    { title: 'Changed', items: account.changed },
    { title: 'Approximated', items: account.approximated },
    { title: 'Lost', items: account.lost },
  ];

  return (
    <Box component="div" aria-label="Conversion preservation and loss account" sx={{ mt: 1 }}>
      {groups.map(({ title, items }) => (
        <Box component="section" key={title} sx={{ mt: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>{title}</Typography>
          {items.length === 0 ? (
            <Typography variant="body2" color="text.secondary">None.</Typography>
          ) : (
            <Box component="ul" sx={{ pl: 2.5, mt: 0.25, mb: 0 }}>
              {items.map((item, index) => (
                <Typography component="li" variant="body2" key={`${item}-${index}`}>
                  {item}
                </Typography>
              ))}
            </Box>
          )}
        </Box>
      ))}
    </Box>
  );
}

function FormatConversionPanel({ sourceDocument }: { sourceDocument: SpatialDocument }) {
  const plan = useMemo(() => planSpatialConversion(sourceDocument), [sourceDocument]);

  return (
    <Box component="section" aria-labelledby="format-conversion-heading" sx={{ mt: 2 }}>
      <Typography id="format-conversion-heading" component="h3" variant="subtitle1">
        Format conversion
      </Typography>
      {plan.status === 'blocked' ? (
        <Alert severity="info" sx={{ mt: 0.75 }}>
          <Typography component="h4" variant="body2" sx={{ fontWeight: 600 }}>
            Conversion unavailable
          </Typography>
          <Typography component="p" variant="body2" sx={{ mb: 0, mt: 0.25 }}>
            {plan.reason}
          </Typography>
        </Alert>
      ) : (
        <details>
          <summary>Review {plan.from === 'geojson' ? 'GeoJSON → JSON-FG' : 'JSON-FG → GeoJSON'} conversion</summary>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
            Review the account before downloading. Your current source remains unchanged. Output file: {plan.targetName}
          </Typography>
          <ConversionAccountSection account={plan.account} />
          <details>
            <summary>View converted output</summary>
            <Box
              component="pre"
              aria-label="Converted format output"
              sx={{ maxHeight: 240, overflow: 'auto', p: 1, bgcolor: 'action.hover', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
            >
              {plan.outputRawText}
            </Box>
          </details>
          <Button size="small" variant="contained" sx={{ mt: 1 }} onClick={() => downloadConvertedFile(plan)}>
            Download converted file
          </Button>
        </details>
      )}
    </Box>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <Box component="div" sx={{ py: 1.25, borderBottom: 1, borderColor: 'divider' }}>
      <Typography component="dt" variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography component="dd" variant="body2" sx={{ m: 0, mt: 0.25, overflowWrap: 'anywhere' }}>
        {value}
      </Typography>
    </Box>
  );
}

function formatDistance(distance: DistanceSummary): string {
  if (distance.totalSegments === 0) return 'No line segments to measure';
  if (distance.rangeExceeded) {
    return `Unavailable (sum exceeds numeric range; ${distance.measuredSegments} of ${distance.totalSegments} segments measured)`;
  }
  if (distance.meters === null) {
    return `Unavailable (${distance.measuredSegments} of ${distance.totalSegments} segments measured)`;
  }
  if (!distance.complete) {
    return `Partial: ${distance.meters.toFixed(1)} m (${distance.measuredSegments} of ${distance.totalSegments} segments); not a complete total`;
  }
  return `${distance.meters.toFixed(1)} m`;
}

function SelectedGeometryMeasurements({ geometry }: { geometry: Geometry | null }) {
  if (geometry === null) return null;
  const measurement = measureGeoJSONGeometry(geometry);
  if (!measurement) return null;

  return (
    <Box component="section" aria-labelledby="selected-geometry-measurements-heading" sx={{ mt: 1.5 }}>
      <Typography id="selected-geometry-measurements-heading" component="h4" variant="subtitle1">
        Elevation and line measurements
      </Typography>
      <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.5 }}>
        Horizontal lengths use a spherical longitude/latitude approximation in meters. Z values use the third ordinate as meters for arithmetic only; no vertical datum is inferred or converted.
      </Typography>
      <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', columnGap: 2, m: 0 }}>
        <Metric
          label="Z statistics (m, third ordinate)"
          value={measurement.zStatistics.measuredCoordinates === 0
            ? 'No Z values'
            : `Min ${measurement.zStatistics.minimum}; max ${measurement.zStatistics.maximum}; mean ${measurement.zStatistics.mean?.toFixed(2)} (${measurement.zStatistics.measuredCoordinates} present, ${measurement.zStatistics.missingCoordinates} missing)`}
        />
        <Metric
          label="2D line length"
          value={measurement.lineProfiles.length === 0
            ? 'Not applicable to this geometry'
            : formatDistance(measurement.horizontalLength)}
        />
        <Metric
          label="3D line length"
          value={measurement.lineProfiles.length === 0
            ? 'Not applicable to this geometry'
            : formatDistance(measurement.threeDimensionalLength)}
        />
      </Box>

      <Typography component="h5" variant="body2" sx={{ mt: 1.5, fontWeight: 600 }}>
        Per-coordinate Z values
      </Typography>
      {measurement.coordinateZ.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          No coordinate tuples.
        </Typography>
      ) : (
        <Box component="ul" aria-label="Per-coordinate Z values" sx={{ listStyle: 'none', p: 0, m: 0, mt: 0.5, maxHeight: 180, overflowY: 'auto' }}>
          {measurement.coordinateZ.map(({ path, z }, index) => (
            <Box component="li" key={`${path.join('.')}-${index}`} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.25 }}>
              <Typography variant="body2">Coordinate {index + 1} · path {path.length > 0 ? path.map((part) => part + 1).join('.') : 'point'}</Typography>
              <Typography variant="body2" color="text.secondary">{z === null ? 'No Z (XY)' : `${z} m`}</Typography>
            </Box>
          ))}
        </Box>
      )}

      <Typography component="h5" variant="body2" sx={{ mt: 1.5, fontWeight: 600 }}>
        Elevation profile
      </Typography>
      {measurement.lineProfiles.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          No supported LineString components; line length and elevation profile are unavailable.
        </Typography>
      ) : (
        measurement.lineProfiles.map((line, lineIndex) => (
          <Box component="section" key={line.path.join('.') || 'root-line'} sx={{ mt: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Line component {lineIndex + 1}{line.path.length > 0 ? ` · path ${line.path.map((part) => part + 1).join('.')}` : ''}
            </Typography>
            <Typography variant="caption" color="text.secondary" component="p" sx={{ my: 0.5 }}>
              2D length: {formatDistance(line.horizontalLength)} · 3D length: {formatDistance(line.threeDimensionalLength)}
            </Typography>
            <Table size="small" aria-label={`Line component ${lineIndex + 1} elevation profile`}>
              <TableHead>
                <TableRow>
                  <TableCell>Vertex</TableCell>
                  <TableCell>Distance along line</TableCell>
                  <TableCell>Z</TableCell>
                  <TableCell>Next segment grade</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {line.coordinates.map((coordinate) => {
                  const nextSegment = line.segments[coordinate.coordinateIndex];
                  const nextCoordinate = line.coordinates[coordinate.coordinateIndex + 1];
                  const grade = nextSegment?.gradePercent;
                  const gradeLabel = grade === undefined || grade === null
                    ? nextSegment?.horizontalMeters === 0
                      ? 'Unavailable (zero run)'
                      : coordinate.z === null || nextCoordinate?.z === null
                        ? 'Unavailable (missing Z)'
                        : nextSegment?.horizontalMeters === null
                          ? 'Unavailable (unsupported lon/lat)'
                          : 'Unavailable (numeric range)'
                    : `${grade.toFixed(2)}%`;
                  return (
                    <TableRow key={coordinate.coordinateIndex}>
                      <TableCell>{coordinate.coordinateIndex + 1}</TableCell>
                      <TableCell>{coordinate.distanceAlongMeters === null ? 'Unavailable' : `${coordinate.distanceAlongMeters.toFixed(1)} m`}</TableCell>
                      <TableCell>{coordinate.z === null ? 'No Z' : `${coordinate.z} m`}</TableCell>
                      <TableCell>{nextSegment ? gradeLabel : '—'}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Box>
        ))
      )}
    </Box>
  );
}

function SelectedFeatureDetails({
  document,
  featureIndex,
  hasSourceLocation,
  onSelectDiagnostic,
  onShowFeatureSource,
  onCompareTerrain,
  terrainComparisonPending,
  terrainComparison,
}: {
  document: SpatialDocument;
  featureIndex: number;
  hasSourceLocation: boolean;
  onSelectDiagnostic?: (diagnostic: Diagnostic) => void;
  onShowFeatureSource?: () => void;
  onCompareTerrain?: () => void;
  terrainComparisonPending: boolean;
  terrainComparison: TerrainComparisonResult | null;
}) {
  if (document.report?.valid !== true || document.parsed === null) return null;
  const feature = getGeoJSONFeature(document.parsed, featureIndex);
  if (!feature) return null;

  const report = inspectGeoJSON(feature);
  const matchingDiagnostics = document.report.diagnostics.filter(
    (diagnostic) => resolveDiagnosticFeatureIndex(document.parsed, diagnostic) === featureIndex,
  );
  const geometryEntries = report.valid
    ? Object.entries(report.summary.geometryCounts).sort(([left], [right]) => left.localeCompare(right))
    : [];
  const geometryType = feature.geometry?.type ?? 'No geometry';

  return (
    <Box component="section" aria-labelledby="selected-feature-heading" sx={{ mb: 2 }}>
      <Typography id="selected-feature-heading" component="h3" variant="subtitle1">
        Selected feature
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Feature {featureIndex + 1} · collection index {featureIndex}
      </Typography>
      <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', columnGap: 2, m: 0 }}>
        <Metric label="Feature ID" value={feature.id === undefined ? 'No ID' : String(feature.id)} />
        <Metric label="Geometry" value={geometryType} />
        {report.valid && (
          <>
            <Metric label="Coordinate tuples" value={report.coordinates.coordinateCount} />
            <Metric label="Dimensions" value={report.coordinates.dimensions} />
            <Metric
              label="Bounds"
              value={report.coordinates.bounds
                ? `X ${report.coordinates.bounds.minX} to ${report.coordinates.bounds.maxX}; Y ${report.coordinates.bounds.minY} to ${report.coordinates.bounds.maxY}`
                : 'No coordinate bounds'}
            />
            <Metric
              label="Z range"
              value={report.coordinates.zRange
                ? `${report.coordinates.zRange.min} to ${report.coordinates.zRange.max}`
                : 'No Z values'}
            />
          </>
        )}
      </Box>
      <SelectedGeometryMeasurements geometry={feature.geometry} />
      {onCompareTerrain && (
        <Box component="section" aria-labelledby="terrain-comparison-heading" sx={{ mt: 1.5 }}>
          <Typography id="terrain-comparison-heading" component="h4" variant="subtitle1">
            Terrain comparison
          </Typography>
          <Typography variant="caption" component="p" color="text.secondary" sx={{ mt: 0.25 }}>
            Raw GeoJSON Z minus sampled terrain height. This is meaningful only when both heights use compatible vertical references; no conversion is applied.
          </Typography>
          <Button size="small" sx={{ mt: 0.5 }} onClick={onCompareTerrain} disabled={terrainComparisonPending}>
            {terrainComparisonPending ? 'Sampling terrain…' : 'Compare with terrain'}
          </Button>
          {terrainComparisonPending && (
            <Typography role="status" variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Waiting for available terrain samples…
            </Typography>
          )}
          {terrainComparison && <TerrainComparisonDetails result={terrainComparison} />}
        </Box>
      )}
      {geometryEntries.length > 0 && (
        <Box component="ul" aria-label="Selected feature geometry counts" sx={{ listStyle: 'none', p: 0, m: 0, mt: 1 }}>
          {geometryEntries.map(([geometry, count]) => (
            <Box component="li" key={geometry} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
              <Typography variant="body2">{geometry}</Typography>
              <Typography variant="body2" color="text.secondary">{count}</Typography>
            </Box>
          ))}
        </Box>
      )}
      {!hasSourceLocation && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          No useful source location is available for this feature.
        </Typography>
      )}
      {hasSourceLocation && onShowFeatureSource && (
        <Button size="small" sx={{ mt: 1 }} onClick={onShowFeatureSource}>
          Show selected feature in source
        </Button>
      )}
      <Typography component="h4" variant="body2" sx={{ mt: 1.5, fontWeight: 600 }}>
        Feature diagnostics
      </Typography>
      {matchingDiagnostics.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
          No feature-specific diagnostics in this report.
        </Typography>
      ) : (
        <DiagnosticList
          diagnostics={matchingDiagnostics}
          onSelectDiagnostic={onSelectDiagnostic}
          featureGeoJSON={document.parsed}
          sourceText={document.source.rawText}
          coordinateChecksRan
        />
      )}
    </Box>
  );
}

function TerrainComparisonDetails({ result }: { result: TerrainComparisonResult }) {
  if (result.status === 'unavailable') {
    const message = result.reason === 'no-elevation'
      ? 'This geometry has no finite Z coordinates to compare.'
      : result.reason === 'no-valid-locations'
        ? 'Coordinates with finite Z are outside the supported longitude/latitude range, so terrain was not sampled.'
      : result.reason === 'no-terrain'
        ? 'Terrain data with tile availability is not ready, so no ground height was assumed.'
        : result.reason === 'sampling-failed'
          ? 'Terrain sampling failed. No ground height was assumed.'
          : result.reason === 'numeric-range'
            ? 'The height difference exceeds the supported numeric range.'
            : 'No finite terrain samples were returned for this geometry.';
    return (
      <Typography role="status" variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
        {message}
      </Typography>
    );
  }

  return (
    <Box role="status" sx={{ mt: 0.75 }}>
      <Typography variant="body2">
        {result.status === 'complete' ? 'Complete' : 'Partial'} comparison: {result.values.length} of {result.totalCoordinates} coordinates; {result.unavailableCoordinates} unavailable.
      </Typography>
      <Box component="ul" aria-label="Terrain comparison values" sx={{ listStyle: 'none', p: 0, m: 0, mt: 0.5 }}>
        {result.values.map((value, index) => (
          <Box component="li" key={`${value.path.join('.')}-${index}`} sx={{ py: 0.25 }}>
            <Typography variant="body2">
              Coordinate {value.path.length > 0 ? value.path.map((part) => part + 1).join('.') : 'point'}: Z {value.sourceZ} m · terrain {value.terrainHeight.toFixed(2)} m · difference {value.difference.toFixed(2)} m
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function DiagnosticList({
  diagnostics,
  onSelectDiagnostic,
  featureGeoJSON,
  sourceText,
  coordinateChecksRan = false,
}: {
  diagnostics: Diagnostic[];
  onSelectDiagnostic?: (diagnostic: Diagnostic) => void;
  featureGeoJSON: GeoJsonValue | null;
  sourceText: string;
  coordinateChecksRan?: boolean;
}) {
  if (diagnostics.length === 0) {
    return (
      <Box component="section" aria-labelledby="diagnostics-heading" sx={{ mt: 2 }}>
        <Typography id="diagnostics-heading" component="h3" variant="subtitle1">
          Diagnostic findings
        </Typography>
        <Typography variant="body2" color="text.secondary" role="status" sx={{ mt: 0.75 }}>
          {coordinateChecksRan
            ? 'No findings from the supported checks. This does not establish comprehensive spatial validity.'
            : 'Coordinate checks could not run because the document did not pass GeoJSON structure validation.'}
        </Typography>
      </Box>
    );
  }

  const counts = new Map<string, { code: Diagnostic['code']; severity: Diagnostic['severity']; count: number }>();
  const severityCounts = new Map<Diagnostic['severity'], number>();
  for (const diagnostic of diagnostics) {
    const key = `${diagnostic.code}:${diagnostic.severity}`;
    const existing = counts.get(key);
    if (existing) existing.count += 1;
    else counts.set(key, { code: diagnostic.code, severity: diagnostic.severity, count: 1 });
    severityCounts.set(diagnostic.severity, (severityCounts.get(diagnostic.severity) ?? 0) + 1);
  }
  const severitySummary = (['error', 'warning', 'info'] as const)
    .flatMap((severity) => {
      const count = severityCounts.get(severity) ?? 0;
      return count === 0 ? [] : [`${count} ${severity}${count === 1 ? '' : 's'}`];
    })
    .join(', ');

  return (
    <Box component="section" aria-labelledby="diagnostics-heading" sx={{ mt: 2 }}>
      <Typography id="diagnostics-heading" component="h3" variant="subtitle1">
        Diagnostic findings
      </Typography>
      <Typography variant="body2" color="text.secondary" role="status" sx={{ mt: 0.75 }}>
        {diagnostics.length} {diagnostics.length === 1 ? 'finding' : 'findings'}: {severitySummary}.
      </Typography>
      <Box component="ul" aria-label="Diagnostic counts" sx={{ listStyle: 'none', p: 0, m: 0, mt: 0.5 }}>
        {[...counts.values()].map(({ code, severity, count }) => (
          <Box component="li" key={`${code}:${severity}`} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.25 }}>
            <Typography variant="body2">{DIAGNOSTIC_DEFINITIONS[code].title}</Typography>
            <Typography variant="body2" color="text.secondary">{count} {severity}{count === 1 ? '' : 's'}</Typography>
          </Box>
        ))}
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
        {coordinateChecksRan
          ? 'Supported checks cover repeated adjacent full tuples, XY/XYZ dimensions, longitude/latitude limits, polygon ring closure, and a numeric precision heuristic above 15 significant digits. They do not establish comprehensive spatial validity or numeric accuracy.'
          : diagnostics.some(({ code }) => code === 'unclosed-polygon-ring')
            ? 'The GeoJSON structure check failed. This ring finding uses only positions that could be read safely; other coordinate checks could not run.'
            : 'The GeoJSON structure check failed, so coordinate checks could not run.'}
      </Typography>
      <Box component="ul" aria-label="Inspection diagnostics" sx={{ listStyle: 'none', p: 0, m: 0 }}>
        {diagnostics.map((diagnostic, index) => {
          const definition = DIAGNOSTIC_DEFINITIONS[diagnostic.code];
          const featureIndex = resolveDiagnosticFeatureIndex(featureGeoJSON, diagnostic);
          const hasUnsafeFeature = featureIndex !== null && diagnostics.some((candidate) =>
            candidate.code === 'coordinate-out-of-range'
            && resolveDiagnosticFeatureIndex(featureGeoJSON, candidate) === featureIndex,
          );
          const hasFeature = hasDiagnosticFeatureReference(diagnostic, featureGeoJSON) && !hasUnsafeFeature;
          const hasSource = resolveDiagnosticSourceLocation(sourceText, featureGeoJSON, diagnostic) !== null;
          return (
            <Box component="li" key={`${diagnostic.code}-${index}`} sx={{ mt: 1.5 }}>
              <Alert severity={diagnostic.severity}>
                <Typography component="h4" variant="subtitle1">
                  {definition.title}
                </Typography>
                <Typography component="p" variant="body2" sx={{ mb: 0, mt: 0.5 }}>
                  {diagnostic.message}
                </Typography>
                {hasUnsafeFeature && (
                  <Typography component="p" variant="body2" sx={{ mb: 0, mt: 0.5 }}>
                    This feature's geometry contains an out-of-range position and is omitted from the globe.
                  </Typography>
                )}
                {diagnostic.code === 'coordinate-out-of-range' && featureIndex === null && (
                  <Typography component="p" variant="body2" sx={{ mb: 0, mt: 0.5 }}>
                    Geometry containing out-of-range coordinates is omitted from the globe.
                  </Typography>
                )}
                {diagnostic.code === 'unclosed-polygon-ring' && (
                  <Typography component="p" variant="body2" sx={{ mb: 0, mt: 0.5 }}>
                    This structurally invalid document is not shown on the globe; use the source to inspect the ring.
                  </Typography>
                )}
                {diagnostic.coordinatePath && (
                  <Typography component="p" variant="caption" sx={{ mb: 0, mt: 0.5 }}>
                    Coordinate path [{diagnostic.coordinatePath.join(', ')}] (zero-based within the geometry)
                  </Typography>
                )}
                <Typography component="code" variant="caption" sx={{ display: 'block', mt: 0.75 }}>
                  {diagnostic.code} · {diagnostic.severity}
                </Typography>
                {onSelectDiagnostic && (hasFeature || hasSource) && (
                  <Button
                    size="small"
                    sx={{ mt: 1 }}
                    onClick={() => onSelectDiagnostic(diagnostic)}
                  >
                    {hasSource
                      ? hasFeature
                        ? 'Show feature and source'
                        : 'Show source'
                      : 'Show feature'}
                  </Button>
                )}
              </Alert>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

export default function InspectorPanel({
  document,
  onSelectDiagnostic,
  onShowFeatureSource,
  selectedFeatureIndex = null,
  selectedFeatureHasSourceLocation = false,
  onCompareTerrain,
  terrainComparisonPending = false,
  terrainComparison = null,
  repairPreview = null,
  canUndoRepair = false,
  onPreviewRepair,
  onApplyRepair,
  onUndoRepair,
}: InspectorPanelProps) {
  if (document.parseError?.kind === 'json-syntax') {
    return (
      <Box component="section" aria-labelledby="inspector-heading" sx={{ height: '100%', overflowY: 'auto', p: 2 }}>
        <Typography id="inspector-heading" component="h2" variant="h6" sx={{ mb: 0.5 }}>
          Dataset overview
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, overflowWrap: 'anywhere' }}>
          {document.source.name}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Source format: {document.format === 'jsonfg' ? 'JSON-FG' : 'GeoJSON'}
        </Typography>
        <Alert severity="error">
          <Typography component="h3" variant="subtitle1">
            JSON syntax error
          </Typography>
          <Typography component="p" variant="body2" sx={{ mb: 0, mt: 0.5 }}>
            {document.format === 'jsonfg'
              ? 'The source text could not be parsed as JSON. Correct the JSON text to inspect the JSON-FG document.'
              : 'The source text could not be parsed as JSON. Correct the JSON text to see a GeoJSON overview.'}
          </Typography>
        </Alert>
        {document.format === 'jsonfg' && <JsonFgDetails info={document.jsonFg} />}
        <GeometryRepairs
          preview={repairPreview}
          canUndo={canUndoRepair}
          onPreview={onPreviewRepair}
          onApply={onApplyRepair}
          onUndo={onUndoRepair}
        />
        <FormatConversionPanel sourceDocument={document} />
      </Box>
    );
  }

  if (document.format === 'jsonfg'
    && (document.parseError?.kind === 'invalid-jsonfg' || document.parseError?.kind === 'unsupported-jsonfg')) {
    return (
      <Box component="section" aria-labelledby="inspector-heading" sx={{ height: '100%', overflowY: 'auto', p: 2 }}>
        <Typography id="inspector-heading" component="h2" variant="h6" sx={{ mb: 0.5 }}>
          Dataset overview
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, overflowWrap: 'anywhere' }}>
          {document.source.name}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Source format: JSON-FG
        </Typography>
        <Alert severity={document.parseError.kind === 'invalid-jsonfg' ? 'error' : 'warning'}>
          <Typography component="h3" variant="subtitle1">
            {document.parseError.kind === 'invalid-jsonfg' ? 'Invalid JSON-FG' : 'Unsupported JSON-FG'}
          </Typography>
          <Typography component="p" variant="body2" sx={{ mb: 0, mt: 0.5 }}>
            {document.parseError.message}
          </Typography>
        </Alert>
        {document.report?.valid === false && (
          <DiagnosticList
            diagnostics={document.report.diagnostics}
            onSelectDiagnostic={onSelectDiagnostic}
            featureGeoJSON={null}
            sourceText={document.source.rawText}
            coordinateChecksRan={false}
          />
        )}
        <JsonFgDetails info={document.jsonFg} />
        <FormatConversionPanel sourceDocument={document} />
      </Box>
    );
  }

  if (document.report?.valid === false) {
    return (
      <Box component="section" aria-labelledby="inspector-heading" sx={{ height: '100%', overflowY: 'auto', p: 2 }}>
        <Typography id="inspector-heading" component="h2" variant="h6" sx={{ mb: 0.5 }}>
          Dataset overview
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, overflowWrap: 'anywhere' }}>
          {document.source.name}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Source format: GeoJSON
        </Typography>
        <Typography variant="body2" color="text.secondary">
          The current document is not valid GeoJSON, so its summary metrics are unavailable.
        </Typography>
        <DiagnosticList
          diagnostics={document.report.diagnostics}
          onSelectDiagnostic={onSelectDiagnostic}
          featureGeoJSON={null}
          sourceText={document.source.rawText}
          coordinateChecksRan={false}
        />
        <GeometryRepairs
          preview={repairPreview}
          canUndo={canUndoRepair}
          onPreview={onPreviewRepair}
          onApply={onApplyRepair}
          onUndo={onUndoRepair}
        />
        <FormatConversionPanel sourceDocument={document} />
      </Box>
    );
  }

  if (!document.report?.valid) return null;

  const { summary, coordinates } = document.report;
  const geometryEntries = Object.entries(summary.geometryCounts).sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
  const dimensionLabel = coordinates.dimensions === 'mixed'
    ? 'Mixed XY/XYZ'
    : coordinates.dimensions === 'empty'
      ? 'Empty'
      : coordinates.dimensions;

  return (
    <Box component="section" aria-labelledby="inspector-heading" sx={{ height: '100%', overflowY: 'auto', p: 2 }}>
      <Typography id="inspector-heading" component="h2" variant="h6" sx={{ mb: 0.5 }}>
        Dataset overview
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, overflowWrap: 'anywhere' }}>
        {document.source.name}
      </Typography>

      {document.format === 'jsonfg' && <JsonFgDetails info={document.jsonFg} />}

      {document.format === 'geojson' && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Source format: GeoJSON
        </Typography>
      )}

      <FormatConversionPanel sourceDocument={document} />

      {selectedFeatureIndex !== null && (
      <SelectedFeatureDetails
          document={document}
          featureIndex={selectedFeatureIndex}
          hasSourceLocation={selectedFeatureHasSourceLocation}
          onSelectDiagnostic={onSelectDiagnostic}
        onShowFeatureSource={onShowFeatureSource}
        onCompareTerrain={onCompareTerrain}
        terrainComparisonPending={terrainComparisonPending}
        terrainComparison={terrainComparison}
      />
      )}

      <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', columnGap: 2, m: 0 }}>
        <Metric label="Feature count" value={summary.featureCount} />
        <Metric label="Dimensions" value={dimensionLabel} />
        <Metric label="Coordinate tuples" value={coordinates.coordinateCount} />
        <Metric
          label="Bounds"
          value={coordinates.bounds
            ? `X ${coordinates.bounds.minX} to ${coordinates.bounds.maxX}; Y ${coordinates.bounds.minY} to ${coordinates.bounds.maxY}`
            : 'No coordinate bounds'}
        />
        <Metric
          label="Z range"
          value={coordinates.zRange
            ? `${coordinates.zRange.min} to ${coordinates.zRange.max}`
            : 'No Z values'}
        />
      </Box>

      <Box component="section" aria-labelledby="geometry-distribution-heading" sx={{ mt: 2 }}>
        <Typography id="geometry-distribution-heading" component="h3" variant="subtitle1">
          Geometry distribution
        </Typography>
        {geometryEntries.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
            No geometries in this document.
          </Typography>
        ) : (
          <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
            {geometryEntries.map(([geometryType, count]) => (
              <Box component="li" key={geometryType} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.75 }}>
                <Typography variant="body2">{geometryType}</Typography>
                <Typography variant="body2" color="text.secondary">{count}</Typography>
              </Box>
            ))}
          </Box>
        )}
      </Box>

      <DiagnosticList
        diagnostics={document.report.diagnostics}
        onSelectDiagnostic={onSelectDiagnostic}
        featureGeoJSON={document.parsed}
        sourceText={document.source.rawText}
        coordinateChecksRan
      />

      <GeometryRepairs
        preview={repairPreview}
        canUndo={canUndoRepair}
        onPreview={onPreviewRepair}
        onApply={onApplyRepair}
        onUndo={onUndoRepair}
      />

    </Box>
  );
}
