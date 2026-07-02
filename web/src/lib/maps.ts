export type MapId = "AmbroseValley" | "GrandRift" | "Lockdown";

export type MapConfig = {
  scale: number;
  origin_x: number;
  origin_z: number;
};

export const MAP_MINIMAP_IMAGE: Record<MapId, string> = {
  AmbroseValley: "/minimaps/AmbroseValley_Minimap.png",
  GrandRift: "/minimaps/GrandRift_Minimap.png",
  Lockdown: "/minimaps/Lockdown_Minimap.jpg",
};

export function worldToMinimapPixel(
  map: MapConfig,
  x: number,
  z: number,
  imageSizePx = 1024,
): { px: number; py: number } {
  // Dataset README defines:
  // u = (x - origin_x)/scale
  // v = (z - origin_z)/scale
  // pixel_x = u*1024
  // pixel_y = (1 - v)*1024  (flip Y because image origin is top-left)
  const u = (x - map.origin_x) / map.scale;
  const v = (z - map.origin_z) / map.scale;
  return { px: u * imageSizePx, py: (1 - v) * imageSizePx };
}

