import { useEffect, useMemo, useRef, useState } from "react";
import * as Cesium from "cesium";
import { Box, FormControlLabel, Switch } from "@mui/material";
import Slider from "@mui/material/Slider";
import Typography from "@mui/material/Typography";
import type { GeoJSON as GeoJsonValue } from "geojson";
import type { SxProps, Theme } from "@mui/material/styles";
import { addAndFlyToIfCurrent } from "../utils/addViewerDataSource";
import {
  getFeatureElevationStyle,
  normalizeVerticalExaggeration,
  scaleGeoJSONHeights,
} from "../utils/elevationVisualization";
import {
  compareTerrainElevations,
  unavailableTerrainComparison,
  type TerrainComparisonRequest,
  type TerrainComparisonResult,
} from "../utils/terrainComparison";
import {
  findCurrentFeatureEntities,
  focusDiagnosticFeature,
  getFeatureIndexFromProperties,
  indexFeaturesForViewer,
  isCurrentLoadedGeoJSON,
} from '../utils/diagnosticNavigation';
import { getOrbitRadius } from '../utils/viewerOrbit';

interface Viewer3DProps {
  geojson: GeoJsonValue | null;
  selectedFeatureIndex: number | null;
  navigationRequestId: number;
  onFeatureSelect?: (featureIndex: number) => void;
  terrainComparisonRequest?: TerrainComparisonRequest | null;
  onTerrainComparisonResult?: (requestId: number, result: TerrainComparisonResult) => void;
  sx?: SxProps<Theme>;
}

interface LoadedDataSource {
  dataSource: Cesium.GeoJsonDataSource;
  geojson: GeoJsonValue;
  featureIndexProperty: string | null;
}

interface RotationData {
  center: Cesium.Cartesian3;
  radius: number;
}

export default function Viewer3D({
  geojson,
  selectedFeatureIndex,
  navigationRequestId,
  onFeatureSelect,
  terrainComparisonRequest = null,
  onTerrainComparisonResult,
  sx,
}: Viewer3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const [isRotating, setIsRotating] = useState(true);
  const [colorByElevation, setColorByElevation] = useState(false);
  const [verticalExaggeration, setVerticalExaggeration] = useState(1);
  const [exaggerationError, setExaggerationError] = useState<string | null>(null);
  const [rotationData, setRotationData] = useState<RotationData | null>(null);
  const [loadedDataSource, setLoadedDataSource] = useState<LoadedDataSource | null>(null);
  const restoreHighlightRef = useRef<(() => void) | null>(null);
  const onFeatureSelectRef = useRef(onFeatureSelect);
  const terrainRequestRef = useRef(terrainComparisonRequest);
  const onTerrainComparisonResultRef = useRef(onTerrainComparisonResult);
  const currentGeoJSONRef = useRef(geojson);
  const lastLoadedCanonicalGeoJSONRef = useRef<GeoJsonValue | null>(null);
  const viewerGeoJSON = useMemo(
    () => geojson === null ? null : scaleGeoJSONHeights(geojson, verticalExaggeration),
    [geojson, verticalExaggeration],
  );
  const elevationStyle = useMemo(
    () => geojson === null ? null : getFeatureElevationStyle(geojson),
    [geojson],
  );
  onFeatureSelectRef.current = onFeatureSelect;
  terrainRequestRef.current = terrainComparisonRequest;
  onTerrainComparisonResultRef.current = onTerrainComparisonResult;
  currentGeoJSONRef.current = geojson;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    Cesium.Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_TOKEN;

    const viewer = new Cesium.Viewer(container, {
      // imagery: default is Ion/Bing world imagery
      terrain: Cesium.Terrain.fromWorldTerrain({
        requestVertexNormals: true,
      }),
      timeline: false,
      animation: false,
      baseLayerPicker: false,
      homeButton: false,
      sceneModePicker: false,
      selectionIndicator: false,
      infoBox: false,
      fullscreenButton: false,
      shadows: false,
    });
    viewer.scene.globe.enableLighting = true;
    viewerRef.current = viewer;

    // Add OSM Buildings
    (async () => {
      try {
        const osmBuildings = await Cesium.Cesium3DTileset.fromIonAssetId(96188);
        if (viewer.isDestroyed()) {
          osmBuildings.destroy();
          return;
        }
        viewer.scene.primitives.add(osmBuildings);
      } catch (error: unknown) {
        console.warn("OSM Buildings not loaded:", error instanceof Error ? error.message : error);
      }
    })();

    // Make the canvas follow its container size
    const ro = new ResizeObserver(() => viewer.resize());
    ro.observe(container);

    return () => {
      ro.disconnect();
      if (!viewer.isDestroyed()) viewer.destroy();
      if (viewerRef.current === viewer) viewerRef.current = null;
    };
  }, []);


  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    // Remove the previously loaded GeoJSON when the current document is invalid.
    setLoadedDataSource(null);
    restoreHighlightRef.current?.();
    restoreHighlightRef.current = null;
    viewer.dataSources.removeAll();
    setRotationData(null);
    if (!geojson || !viewerGeoJSON) return;

    let cancelled = false;
    let dataSource: Cesium.GeoJsonDataSource | null = null;
    const isCurrent = () => !cancelled && !viewer.isDestroyed();

    const loadGeoJSON = async () => {
      try {
        const indexedViewerValue = indexFeaturesForViewer(viewerGeoJSON);
        dataSource = await Cesium.GeoJsonDataSource.load(indexedViewerValue.geojson, {
          clampToGround: false,
          markerColor: Cesium.Color.RED, // for point features
        });
        if (!isCurrent()) return;

        const loadedDataSource = dataSource;
        const shouldFlyToDocument = lastLoadedCanonicalGeoJSONRef.current !== geojson;
        let addedAndViewed = false;
        if (shouldFlyToDocument) {
          addedAndViewed = await addAndFlyToIfCurrent(
            loadedDataSource,
            {
              add: async (source) => {
                await viewer.dataSources.add(source);
              },
              remove: (source) => {
                if (!viewer.isDestroyed()) viewer.dataSources.remove(source, true);
              },
              flyTo: (source) => viewer.flyTo(source),
            },
            isCurrent,
          );
        } else {
          await viewer.dataSources.add(loadedDataSource);
          if (isCurrent()) {
            addedAndViewed = true;
          } else if (!viewer.isDestroyed()) {
            viewer.dataSources.remove(loadedDataSource, true);
          }
        }
        if (!addedAndViewed || !isCurrent()) return;

        lastLoadedCanonicalGeoJSONRef.current = geojson;
        setLoadedDataSource({
          dataSource: loadedDataSource,
          geojson,
          featureIndexProperty: indexedViewerValue.featureIndexProperty,
        });

        // Compute bounding sphere center & radius
        const positions: Cesium.Cartesian3[] = [];
        const time = Cesium.JulianDate.now();
        loadedDataSource.entities.values.forEach((entity) => {
          if (entity.position) {
            const position = entity.position.getValue(time);
            if (position) positions.push(position);
          } else if (entity.polygon) {
            const hierarchy = entity.polygon.hierarchy?.getValue(time);
            if (hierarchy) positions.push(...hierarchy.positions);
          } else if (entity.polyline) {
            const points = entity.polyline.positions?.getValue(time);
            if (points) positions.push(...points);
          }
        });

        const boundingSphere = Cesium.BoundingSphere.fromPoints(positions);
        const radius = getOrbitRadius(boundingSphere.radius);
        setRotationData(radius === null ? null : {
          center: boundingSphere.center,
          radius,
        });
      } catch (error: unknown) {
        if (!cancelled) {
          console.error('GeoJSON viewer load failed:', error instanceof Error ? error.message : error);
        }
      }
    };

    void loadGeoJSON();
    return () => {
      cancelled = true;
      restoreHighlightRef.current?.();
      restoreHighlightRef.current = null;
      if (!viewer.isDestroyed()) viewer.camera.cancelFlight();
      setLoadedDataSource((current) => current?.dataSource === dataSource ? null : current);
      if (dataSource && !viewer.isDestroyed()) {
        viewer.dataSources.remove(dataSource, true);
      }
    };
  }, [geojson, viewerGeoJSON]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer
        || viewer.isDestroyed()
        || !loadedDataSource?.featureIndexProperty
        || !isCurrentLoadedGeoJSON(geojson, loadedDataSource.geojson)) return;

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((click: { position: Cesium.Cartesian2 }) => {
      if (!isCurrentLoadedGeoJSON(currentGeoJSONRef.current, loadedDataSource.geojson)) return;
      const picked = viewer.scene.pick(click.position);
      const pickedId = picked && 'id' in picked
        ? (picked as { id?: unknown }).id
        : undefined;
      const entity = pickedId instanceof Cesium.Entity
        ? pickedId
        : typeof pickedId === 'string'
          ? loadedDataSource.dataSource.entities.getById(pickedId)
          : undefined;
      const time = Cesium.JulianDate.now();
      const properties = entity?.properties?.getValue(time) as Record<string, unknown> | undefined;
      const featureIndex = getFeatureIndexFromProperties(
        properties,
        loadedDataSource.featureIndexProperty,
      );
      if (featureIndex !== null) onFeatureSelectRef.current?.(featureIndex);
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    return () => handler.destroy();
  }, [geojson, loadedDataSource]);

  useEffect(() => {
    if (!colorByElevation || !loadedDataSource || !elevationStyle) return;
    if (!isCurrentLoadedGeoJSON(geojson, loadedDataSource.geojson)) return;

    const time = Cesium.JulianDate.now();
    const restore: Array<() => void> = [];
    for (const entity of loadedDataSource.dataSource.entities.values) {
      const properties = entity.properties?.getValue(time) as Record<string, unknown> | undefined;
      const featureIndex = getFeatureIndexFromProperties(
        properties,
        loadedDataSource.featureIndexProperty,
      );
      if (featureIndex !== null && featureIndex === selectedFeatureIndex) continue;
      const colorValue = elevationStyle.colors.get(featureIndex ?? 0);
      if (!colorValue) continue;
      const color = Cesium.Color.fromCssColorString(colorValue);

      if (entity.polygon) {
        const polygon = entity.polygon;
        const previous = {
          material: polygon.material,
          outlineColor: polygon.outlineColor,
        };
        polygon.material = new Cesium.ColorMaterialProperty(color.withAlpha(0.65));
        polygon.outlineColor = new Cesium.ConstantProperty(color);
        restore.push(() => {
          polygon.material = previous.material;
          polygon.outlineColor = previous.outlineColor;
        });
      }
      if (entity.polyline) {
        const polyline = entity.polyline;
        const previous = polyline.material;
        polyline.material = new Cesium.ColorMaterialProperty(color);
        restore.push(() => { polyline.material = previous; });
      }
      if (entity.billboard) {
        const billboard = entity.billboard;
        const previous = billboard.color;
        billboard.color = new Cesium.ConstantProperty(color);
        restore.push(() => { billboard.color = previous; });
      }
      if (entity.point) {
        const point = entity.point;
        const previous = point.color;
        point.color = new Cesium.ConstantProperty(color);
        restore.push(() => { point.color = previous; });
      }
    }

    return () => {
      for (const restoreOne of restore) restoreOne();
    };
  }, [colorByElevation, elevationStyle, geojson, loadedDataSource, selectedFeatureIndex]);

  useEffect(() => {
    const viewer = viewerRef.current;
    const request = terrainComparisonRequest;
    if (
      !viewer ||
      viewer.isDestroyed() ||
      !request ||
      request.geojson !== geojson ||
      selectedFeatureIndex !== request.featureIndex
    ) {
      return;
    }

    let active = true;
    let cancelProviderWait: () => void = () => {};
    const isCurrent = () =>
      active
      && currentGeoJSONRef.current === request.geojson
      && terrainRequestRef.current?.requestId === request.requestId;

    const runComparison = async () => {
      if (!request.coordinates.some((point) => point.sourceZ !== null && Number.isFinite(point.sourceZ))) {
        const result = await compareTerrainElevations(request.coordinates, async () => [], isCurrent);
        if (result && isCurrent()) {
          onTerrainComparisonResultRef.current?.(request.requestId, result);
        }
        return;
      }
      const { promise, cancel } = waitForTerrainProvider(viewer, isCurrent);
      cancelProviderWait = cancel;
      const provider = await promise;
      if (!isCurrent()) return;
      if (!provider) {
        onTerrainComparisonResultRef.current?.(
          request.requestId,
          unavailableTerrainComparison('no-terrain', request.coordinates),
        );
        return;
      }

      const result = await compareTerrainElevations(
        request.coordinates,
        async (points) => {
          const positions = points.map(({ longitude, latitude }) =>
            Cesium.Cartographic.fromDegrees(longitude, latitude),
          );
          const sampled = await Cesium.sampleTerrainMostDetailed(provider, positions, false);
          return sampled.map((position) => position.height);
        },
        isCurrent,
      );
      if (result && isCurrent()) {
        onTerrainComparisonResultRef.current?.(request.requestId, result);
      }
    };

    void runComparison();
    return () => {
      active = false;
      cancelProviderWait();
    };
  }, [geojson, selectedFeatureIndex, terrainComparisonRequest]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    restoreHighlightRef.current?.();
    restoreHighlightRef.current = null;
    viewer.camera.cancelFlight();

    if (selectedFeatureIndex === null || !loadedDataSource) return;

    const time = Cesium.JulianDate.now();
    const propertiesFor = (entity: Cesium.Entity) =>
      entity.properties?.getValue(time) as Record<string, unknown> | undefined;
    const entities = findCurrentFeatureEntities(
      geojson,
      loadedDataSource.geojson,
      loadedDataSource.dataSource.entities.values,
      selectedFeatureIndex,
      loadedDataSource.featureIndexProperty,
      propertiesFor,
    ).filter(hasVisibleGeometry);
    const plan = { featureIndex: selectedFeatureIndex, entities, sourceLocation: null };
    let active = true;
    const didFocus = focusDiagnosticFeature({ ...plan, entities }, {
      highlight: (targetEntities) => {
        restoreHighlightRef.current = highlightEntities(targetEntities, time);
      },
      flyTo: (targetEntities) => {
        setIsRotating(false);
        void viewer.flyTo(targetEntities).catch((error: unknown) => {
          if (active) {
            console.warn('Diagnostic navigation failed:', error instanceof Error ? error.message : error);
          }
        });
      },
    });
    if (!didFocus) return;

    return () => {
      active = false;
      if (!viewer.isDestroyed()) viewer.camera.cancelFlight();
      restoreHighlightRef.current?.();
      restoreHighlightRef.current = null;
    };
  }, [colorByElevation, geojson, loadedDataSource, navigationRequestId, selectedFeatureIndex]);

  const handleExaggerationChange = (value: number) => {
    const nextFactor = normalizeVerticalExaggeration(value);
    if (geojson && scaleGeoJSONHeights(geojson, nextFactor) === null) {
      setExaggerationError('This factor exceeds the supported numeric range; the viewer was not changed.');
      return;
    }
    setExaggerationError(null);
    setVerticalExaggeration(nextFactor);
  };

  // Orbit logic
  useEffect(() => {
    if (!rotationData || !viewerRef.current || viewerRef.current.isDestroyed()) return;

    const viewer = viewerRef.current;
    let angle = 0;

    const tickCallback = () => {
      if (!isRotating || viewer.isDestroyed()) return;

      const { center, radius } = rotationData;
      angle += 0.001; // speed
      const x = radius * Math.cos(angle);
      const y = radius * Math.sin(angle);
      const offset = new Cesium.Cartesian3(x, y, radius * 1);

      viewer.camera.lookAtTransform(
        Cesium.Transforms.eastNorthUpToFixedFrame(center)
      );
      viewer.camera.lookAt(center, offset);
    };

    viewer.clock.onTick.addEventListener(tickCallback);

    return () => {
      viewer.clock.onTick.removeEventListener(tickCallback);
      if (!viewer.isDestroyed()) viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY); // restore control
    };
  }, [isRotating, rotationData]);

 return (
    <Box sx={{ position: "relative", height: "100%", ...sx }}>
      <Box
        ref={containerRef}
        sx={{
          width: "100%",
          height: "100%",
          borderRadius: 2,
          overflow: "hidden",
        }}
      />
      <Box
        sx={{
          position: "absolute",
          top: 10,
          left: 10,
          width: 230,
          maxWidth: 'calc(100% - 20px)',
          p: 1,
          borderRadius: 1,
          bgcolor: 'rgba(255,255,255,0.92)',
        }}
        >
          <FormControlLabel
            control={<Switch checked={isRotating} onChange={(_event, checked) => setIsRotating(checked)} />}
            label="Auto-rotate"
          />
          <FormControlLabel
            control={<Switch checked={colorByElevation} onChange={(_event, checked) => setColorByElevation(checked)} />}
            label="Color by elevation"
          />
          <Typography variant="caption" component="p" sx={{ m: 0 }}>
            Color follows each feature’s mean Z within the document range; features without Z keep their default style.
          </Typography>
          <Typography variant="caption" component="label" htmlFor="vertical-exaggeration-slider">
            Vertical exaggeration: {verticalExaggeration.toFixed(1)}×
          </Typography>
          <Slider
            id="vertical-exaggeration-slider"
            aria-label="Vertical exaggeration"
            min={1}
            max={5}
            step={0.5}
            value={verticalExaggeration}
            onChangeCommitted={(_event, value) => {
              if (typeof value === 'number') handleExaggerationChange(value);
            }}
            size="small"
          />
          <Typography variant="caption" component="p" sx={{ m: 0 }}>
            Viewer copy only; GeoJSON Z is treated as meters and scaled from ellipsoid height zero.
          </Typography>
          {exaggerationError && (
            <Typography role="status" variant="caption" color="error" component="p" sx={{ m: 0 }}>
              {exaggerationError}
            </Typography>
          )}
      </Box>
    </Box>
  );
}

function hasVisibleGeometry(entity: Cesium.Entity): boolean {
  return Boolean(entity.position || entity.polygon || entity.polyline || entity.billboard);
}

function waitForTerrainProvider(
  viewer: Cesium.Viewer,
  isCurrent: () => boolean,
): { promise: Promise<Cesium.TerrainProvider | null>; cancel: () => void } {
  const globe = viewer.scene.globe;
  const currentProvider = () => {
    if (viewer.isDestroyed()) return null;
    const provider = globe.terrainProvider;
    if (provider instanceof Cesium.EllipsoidTerrainProvider) return undefined;
    return provider.availability ? provider : null;
  };
  const available = currentProvider();
  if (available !== undefined) {
    return { promise: Promise.resolve(available), cancel: () => undefined };
  }

  let removeListener: () => void = () => {};
  let timeout = 0;
  let settle: (provider: Cesium.TerrainProvider | null) => void = () => {};
  const promise = new Promise<Cesium.TerrainProvider | null>((resolve) => {
    let settled = false;
    const finish = (provider: Cesium.TerrainProvider | null) => {
      if (settled) return;
      settled = true;
      removeListener();
      window.clearTimeout(timeout);
      resolve(provider);
    };
    settle = finish;
    const checkProvider = () => {
      const provider = currentProvider();
      if (provider !== undefined) finish(provider);
      else if (!isCurrent()) finish(null);
    };
    removeListener = globe.terrainProviderChanged.addEventListener(checkProvider);
    timeout = window.setTimeout(() => finish(null), 10_000);
    checkProvider();
  });
  return {
    promise,
    cancel: () => settle(null),
  };
}

function highlightEntities(entities: Cesium.Entity[], time: Cesium.JulianDate): () => void {
  const restore: Array<() => void> = [];
  const yellow = Cesium.Color.YELLOW;

  for (const entity of entities) {
    if (entity.polygon) {
      const polygon = entity.polygon;
      const previous = {
        outline: polygon.outline,
        outlineColor: polygon.outlineColor,
        outlineWidth: polygon.outlineWidth,
      };
      polygon.outline = new Cesium.ConstantProperty(true);
      polygon.outlineColor = new Cesium.ConstantProperty(yellow);
      polygon.outlineWidth = new Cesium.ConstantProperty(4);
      restore.push(() => {
        polygon.outline = previous.outline;
        polygon.outlineColor = previous.outlineColor;
        polygon.outlineWidth = previous.outlineWidth;
      });
    }

    if (entity.polyline) {
      const polyline = entity.polyline;
      const previous = { material: polyline.material, width: polyline.width };
      polyline.material = new Cesium.ColorMaterialProperty(yellow);
      polyline.width = new Cesium.ConstantProperty(4);
      restore.push(() => {
        polyline.material = previous.material;
        polyline.width = previous.width;
      });
    }

    if (entity.billboard) {
      const billboard = entity.billboard;
      const previous = { color: billboard.color, scale: billboard.scale };
      const scale = billboard.scale?.getValue(time) ?? 1;
      billboard.color = new Cesium.ConstantProperty(yellow);
      billboard.scale = new Cesium.ConstantProperty(scale * 1.5);
      restore.push(() => {
        billboard.color = previous.color;
        billboard.scale = previous.scale;
      });
    }
  }

  return () => {
    for (const restoreOne of restore) restoreOne();
  };
}
