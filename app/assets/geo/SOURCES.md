# AllEarth geography data

`countries.js` is a browser-ready, self-contained file: it assigns
`window.AllEarthGeo` and never makes a runtime network request. Regenerate it
with `python generate_countries.py` after placing the two input downloads in
this directory.

## Boundary geometry

- Natural Earth, **Admin 0 – Countries**, 1:50m (`ne_50m_admin_0_countries`),
  version 5.1.2, downloaded 2026-10-20 from
  <https://naciscdn.org/naturalearth/50m/cultural/ne_50m_admin_0_countries.zip>.
- Natural Earth data are public domain:
  <https://www.naturalearthdata.com/about/terms-of-use/>.
- The original ZIP is retained as the input snapshot. Its geometry is simplified
  once with Mapshaper's topology-aware shared-arc Visvalingam algorithm at 10%
  retained vertices, `keep-shapes`, and four decimal-place coordinate precision.
  This keeps a common border identical on both neighbours while reducing browser
  mesh work. The intermediate `ne_50m_admin_0_countries_simplified.geojson` is
  the reproducible geometry input to the generator. It is an overview map, not
  a legal boundary assertion.

Mapshaper may emit the opposite GeoJSON ring winding. The generator restores
Natural Earth's clockwise exteriors and counter-clockwise holes so this globe's
spherical renderer selects each country's interior, rather than its complement.

Regenerate that input with a Mapshaper 0.6-compatible CLI after extracting the
retained ZIP, then run the Python generator:

```text
mapshaper ne_50m_admin_0_countries.shp -simplify 10% keep-shapes \
  -o format=geojson precision=0.0001 ne_50m_admin_0_countries_simplified.geojson
python generate_countries.py
python validate_countries.py
```

## Country search catalog

- `mledoze/countries`, `countries.json`, commit
  `c2ac0049c14edcf2436c7aa1b2493222a020b462`, downloaded 2026-10-20 from
  <https://raw.githubusercontent.com/mledoze/countries/c2ac0049c14edcf2436c7aa1b2493222a020b462/countries.json>.
- Upstream repository and ODbL 1.0 license:
  <https://github.com/mledoze/countries>.
- ODbL 1.0 full legal text is bundled as `LICENSE-ODbL-1.0.txt` (canonical
  SPDX copy: <https://spdx.org/licenses/ODbL-1.0.html>).
- The catalog supplies ISO alpha-2/alpha-3 identifiers, Korean translations,
  English names/aliases, and representative latitude/longitude. IDs are lower
  case ISO alpha-2. The source's stable nonstandard territory codes (such as
  `xk` for Kosovo) are retained where supplied.

The generator joins a Natural Earth feature to the catalog only through its
alpha-3 identity. Catalog records without a matching map feature remain in the
catalog so search can still provide a coordinate marker.

Natural Earth records that cannot responsibly be joined to a catalog ID are
still retained as `contextOnly: true` map features, using a stable `ne-*` ID.
They are non-clickable contextual land, so no coastline becomes a visual hole.

## Product search overrides and validation

The generator explicitly pins Korea (`kr`) to `대한민국`, `한국`, 36.5, 127.8;
this avoids an upstream translation or centroid change altering the initial
experience. It also adds common terms such as `중국`, `호주`, `영국`, and `UK` as
aliases without replacing source names.

Run `python validate_countries.py` after generation. It checks the 249 assigned
ISO alpha-2 IDs plus non-ISO `xk` (Kosovo) for 250 catalog records, 242 total
features (237 catalog-linked + 5 contextual), duplicate IDs, geometry types,
country coordinates, and the product search overrides. The generator groups
Shapefile rings by geometric containment rather than ring order or winding.
