import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import cesium from "vite-plugin-cesium";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const cesiumBuildRootPath = resolve(repositoryRoot, "node_modules/cesium/Build");
const cesiumBuildPath = resolve(cesiumBuildRootPath, "Cesium");

export default defineConfig({
  envDir: repositoryRoot,
  plugins: [react(), cesium({ cesiumBuildRootPath, cesiumBuildPath })],
  base: "/Geoviewer3D/", // public path for GitHub Pages
  build: {
    outDir: "../../dist",
    emptyOutDir: true,
  },
});
