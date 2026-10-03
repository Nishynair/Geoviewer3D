import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { SpatialDocument } from '../spatialDocument';

interface InspectorPanelProps {
  document: SpatialDocument;
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

export default function InspectorPanel({ document }: InspectorPanelProps) {
  if (document.report?.valid !== true) {
    return (
      <Box component="section" aria-labelledby="inspector-heading" sx={{ height: '100%', overflowY: 'auto', p: 2 }}>
        <Typography id="inspector-heading" component="h2" variant="h6" sx={{ mb: 0.5 }}>
          Dataset overview
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, overflowWrap: 'anywhere' }}>
          {document.source.name}
        </Typography>
        <Alert severity="info">
          An overview is unavailable for this document. The current contents must be valid before metrics can be shown.
        </Alert>
      </Box>
    );
  }

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

    </Box>
  );
}
