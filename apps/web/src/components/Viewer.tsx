import { useEffect, useRef, useState } from "react";
import * as Cesium from "cesium";
import { Box, FormControlLabel, Switch } from "@mui/material";
import type { GeoJSON as GeoJsonValue } from "geojson";
import type { SxProps, Theme } from "@mui/material/styles";
import { addAndFlyToIfCurrent } from "../utils/addViewerDataSource";
import {
  findCurrentFeatureEntities,
  focusDiagnosticFeature,
  getFeatureIndexFromProperties,
  indexFeaturesForViewer,
  isCurrentLoadedGeoJSON,
} from '../utils/diagnosticNavigation';

interface Viewer3DProps {
  geojson: GeoJsonValue | null;
  selectedFeatureIndex: number | null;
  navigationRequestId: number;
  onFeatureSelect?: (featureIndex: number) => void;
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
  sx,
}: Viewer3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const [isRotating, setIsRotating] = useState(true);
  const [rotationData, setRotationData] = useState<RotationData | null>(null);
  const [loadedDataSource, setLoadedDataSource] = useState<LoadedDataSource | null>(null);
  const restoreHighlightRef = useRef<(() => void) | null>(null);
  const onFeatureSelectRef = useRef(onFeatureSelect);
  const currentGeoJSONRef = useRef(geojson);
  onFeatureSelectRef.current = onFeatureSelect;
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
    if (!geojson) return;

    let cancelled = false;
    let dataSource: Cesium.GeoJsonDataSource | null = null;
    const isCurrent = () => !cancelled && !viewer.isDestroyed();

    const loadGeoJSON = async () => {
      try {
        const indexedViewerValue = indexFeaturesForViewer(geojson);
        dataSource = await Cesium.GeoJsonDataSource.load(indexedViewerValue.geojson, {
          clampToGround: false,
          markerColor: Cesium.Color.RED, // for point features
        });
        if (!isCurrent()) return;

        const loadedDataSource = dataSource;
        const addedAndViewed = await addAndFlyToIfCurrent(
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
        if (!addedAndViewed || !isCurrent()) return;

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
        setRotationData({
          center: boundingSphere.center,
          radius: boundingSphere.radius * 2.0,
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
  }, [geojson]);

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
  }, [geojson, loadedDataSource, navigationRequestId, selectedFeatureIndex]);

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
        }}
        >
          <FormControlLabel 
            control={<Switch checked={isRotating} />}
            label="Auto-rotate" 
            onChange={()=>setIsRotating(!isRotating)}
          />
      </Box>
    </Box>
  );
}

function hasVisibleGeometry(entity: Cesium.Entity): boolean {
  return Boolean(entity.position || entity.polygon || entity.polyline || entity.billboard);
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
