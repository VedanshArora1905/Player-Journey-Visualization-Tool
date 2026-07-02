## Coordinate mapping (world → minimap)

The dataset README defines a per-map affine mapping from world \((x,z)\) into minimap pixel coordinates on a 1024×1024 image.

### Map config constants
| Map | Scale | OriginX | OriginZ |
|---|---:|---:|---:|
| AmbroseValley | 900 | -370 | -473 |
| GrandRift | 581 | -290 | -290 |
| Lockdown | 1000 | -500 | -500 |

### Formula
Step 1 (world → UV):
- \(u = (x - origin_x) / scale\)
- \(v = (z - origin_z) / scale\)

Step 2 (UV → pixels):
- \(pixel_x = u * 1024\)
- \(pixel_y = (1 - v) * 1024\)

The \(1 - v\) flip is required because minimap images use a top-left origin, while the world-space Z axis increases “up” the minimap.

### Implementation
Implemented as `worldToMinimapPixel(...)` in `web/src/lib/maps.ts`.

