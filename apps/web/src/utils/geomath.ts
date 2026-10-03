import proj4 from "proj4";

type Hemisphere = "N" | "S";
type Wgs84Coordinate = [longitude: number, latitude: number, height?: number];
type UTMCoordinate = [easting: number, northing: number, height: number];

function getUTMZone(latDeg: number, lonDeg: number): { zone: number; hemisphere: Hemisphere } {

  // Normalize longitude to [-180, 180)
  const lon = ((lonDeg + 180) % 360 + 360) % 360 - 180;

  // Base zone
  let zone = Math.floor((lon + 180) / 6) + 1;

  // Special cases:
  // 1. Norway exception: lat between 56°N and 64°N, lon between 3°E and 12°E → Zone 32
  if (latDeg >= 56 && latDeg < 64 && lonDeg >= 3 && lonDeg < 12) {
    zone = 32;
  }

  // 2. Svalbard exceptions: lat between 72°N and 84°N
  if (latDeg >= 72 && latDeg < 84) {
    if (lonDeg >= 0   && lonDeg < 9)  zone = 31;
    else if (lonDeg >= 9   && lonDeg < 21) zone = 33;
    else if (lonDeg >= 21  && lonDeg < 33) zone = 35;
    else if (lonDeg >= 33  && lonDeg < 42) zone = 37;
  }

  // Hemisphere
  const hemisphere = latDeg >= 0 ? "N" : "S";

  return { zone, hemisphere };
}

function utmProjString(zone: number, hemisphere: Hemisphere): string {
  const isSouth = hemisphere === "S" ? " +south" : "";
  return `+proj=utm +zone=${zone} +datum=WGS84 +units=m +no_defs${isSouth}`;
}

export function wgs84ToUTM(wgs84Coord: Wgs84Coordinate): UTMCoordinate {
  const [lonDeg, latDeg, h = 0] = wgs84Coord;

  if (latDeg > 84 || latDeg < -80) {
    throw new Error("UTM is undefined poleward of 84°N / 80°S.");
  }

  const { zone, hemisphere } = getUTMZone(latDeg, lonDeg);
  const projDef = utmProjString(zone, hemisphere);

  // Transform x,y to UTM coordinates
  const wgs84Point: [number, number] = [lonDeg, latDeg];
  const [x, y] = proj4("WGS84", projDef, wgs84Point);

  return [x, y, h];
}

export function utmToWgs84(
  x: number,
  y: number,
  zone: number,
  hemisphere: Hemisphere,
): { lon: number; lat: number } {
  const projDef = utmProjString(zone, hemisphere);
  const utmPoint: [number, number] = [x, y];
  const [lon, lat] = proj4(projDef, "WGS84", utmPoint);
  return { lon, lat };
}
