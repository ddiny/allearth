"""Build the file://-safe AllEarth geography asset.

Inputs are deliberately kept beside this script so the generated browser bundle can
be reproduced without an application-time network request.
"""
from __future__ import annotations

import json
import struct
import zipfile
from datetime import date
from pathlib import Path

HERE = Path(__file__).parent
NE_ZIP = HERE / "ne_50m_admin_0_countries.zip"
SIMPLIFIED_GEOJSON = HERE / "ne_50m_admin_0_countries_simplified.geojson"
COUNTRIES = HERE / "countries-source.json"
OUTPUT = HERE / "countries.js"


def dbf_rows(data: bytes):
    count, header_len, record_len = struct.unpack_from("<xxxxIHH", data, 0)
    fields, offset = [], 32
    while data[offset] != 13:
        name = data[offset:offset + 11].split(b"\0")[0].decode("ascii")
        kind = chr(data[offset + 11])
        length = data[offset + 16]
        fields.append((name, kind, length))
        offset += 32
    rows = []
    for index in range(count):
        record = data[header_len + index * record_len:header_len + (index + 1) * record_len]
        if not record or record[0] == 42:
            continue
        row, cursor = {}, 1
        for name, kind, length in fields:
            raw = record[cursor:cursor + length].decode("latin1").strip(" \x00")
            cursor += length
            row[name] = raw
        rows.append(row)
    return rows


def shp_polygons(data: bytes):
    """Read polygon records from a ShapeFile (types 5/15/25)."""
    geometries, offset = [], 100
    while offset + 8 <= len(data):
        _, length_words = struct.unpack_from(">2i", data, offset)
        body = data[offset + 8:offset + 8 + length_words * 2]
        offset += 8 + length_words * 2
        if len(body) < 44 or struct.unpack_from("<i", body, 0)[0] not in (5, 15, 25):
            geometries.append(None)
            continue
        parts_count, points_count = struct.unpack_from("<2i", body, 36)
        parts = struct.unpack_from("<" + "i" * parts_count, body, 44)
        point_offset = 44 + parts_count * 4
        points = [struct.unpack_from("<2d", body, point_offset + i * 16) for i in range(points_count)]
        rings = []
        for i, start in enumerate(parts):
            end = parts[i + 1] if i + 1 < parts_count else points_count
            rings.append([[round(x, 4), round(y, 4)] for x, y in points[start:end]])
        geometries.append({"type": "Polygon", "coordinates": rings})
    return geometries


def ring_area(ring):
    return sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(ring, ring[1:]))


def point_in_ring(point, ring):
    """Ray casting containment test; boundary hits count as contained."""
    x, y = point
    inside = False
    for a, b in zip(ring, ring[1:]):
        ax, ay = a
        bx, by = b
        if min(ax, bx) <= x <= max(ax, bx) and min(ay, by) <= y <= max(ay, by):
            cross = (bx - ax) * (y - ay) - (by - ay) * (x - ax)
            if abs(cross) < 1e-9:
                return True
        if (ay > y) != (by > y):
            crossing_x = (bx - ax) * (y - ay) / (by - ay) + ax
            if x < crossing_x:
                inside = not inside
    return inside


def polygon_groups(rings):
    """Build polygons from ring containment, never from Shapefile order/winding.

    A ring at an even containment depth is an exterior. Its direct odd-depth
    children are holes; a depth-two island is a separate polygon. This handles
    holes even when a source changes ring order or winding convention.
    """
    rings = [ring for ring in rings if len(ring) >= 4]
    areas = [abs(ring_area(ring)) for ring in rings]
    parents = [None] * len(rings)
    for child, ring in enumerate(rings):
        containers = [parent for parent, candidate in enumerate(rings)
                      if parent != child and areas[parent] > areas[child]
                      and point_in_ring(ring[0], candidate)]
        if containers:
            parents[child] = min(containers, key=lambda index: areas[index])
    depths = []
    for index in range(len(rings)):
        depth, parent = 0, parents[index]
        while parent is not None:
            depth += 1
            parent = parents[parent]
        depths.append(depth)
    groups = []
    for outer, ring in enumerate(rings):
        if depths[outer] % 2:
            continue
        holes = [rings[index] for index, parent in enumerate(parents)
                 if parent == outer and depths[index] == depths[outer] + 1]
        groups.append([ring, *holes])
    return groups


def geometry_for(geometry):
    if geometry["type"] == "Polygon":
        rings = geometry["coordinates"]
    elif geometry["type"] == "MultiPolygon":
        rings = [ring for polygon in geometry["coordinates"] for ring in polygon]
    else:
        raise ValueError("Unexpected Natural Earth geometry: " + geometry["type"])
    groups = polygon_groups(rings)
    original_rings = [ring for ring in rings if len(ring) >= 4]
    assert sum(len(group) for group in groups) == len(original_rings), "ring grouping lost geometry"
    assert all(point_in_ring(hole[0], group[0]) for group in groups for hole in group[1:]), "hole outside exterior"
    # Natural Earth's Shapefile convention is clockwise exteriors and
    # counter-clockwise holes. Mapshaper's GeoJSON export may flip those rings;
    # restore the source convention because the globe's spherical renderer uses
    # it to choose the small interior rather than the globe-complement fill.
    groups = [
        [group[0] if ring_area(group[0]) < 0 else list(reversed(group[0])),
         *[hole if ring_area(hole) > 0 else list(reversed(hole)) for hole in group[1:]]]
        for group in groups
    ]
    assert all(ring_area(group[0]) < 0 and all(ring_area(hole) > 0 for hole in group[1:])
               for group in groups), "unexpected output ring winding"
    if len(groups) == 1:
        return {"type": "Polygon", "coordinates": groups[0]}
    return {"type": "MultiPolygon", "coordinates": groups}


def korean_name(country):
    return (country.get("translations", {}).get("kor", {}).get("common")
            or country.get("name", {}).get("common")
            or country["cca2"])


def aliases_for(country):
    values = [
        country.get("name", {}).get("official"),
        *country.get("altSpellings", []),
        *[entry.get("common") for entry in country.get("name", {}).get("nativeName", {}).values()],
    ]
    common = country.get("name", {}).get("common")
    return list(dict.fromkeys(v for v in values if v and v != common))


# Product-facing names deliberately supplement upstream translations. They make
# common Korean and English search terms deterministic across source updates.
CATALOG_OVERRIDES = {
    "kr": {"name": "대한민국", "lat": 36.5, "lng": 127.8, "aliases": ["한국", "South Korea", "Republic of Korea"]},
    "cn": {"aliases": ["중국", "China"]},
    "au": {"aliases": ["호주", "Australia"]},
    "gb": {"aliases": ["영국", "UK", "U.K.", "United Kingdom", "Britain"]},
    "us": {"aliases": ["미국", "USA", "U.S.A.", "United States"]},
    "jp": {"aliases": ["일본", "Japan"]},
    "tw": {"aliases": ["대만", "Taiwan"]},
}


def main():
    simplified = json.loads(SIMPLIFIED_GEOJSON.read_text(encoding="utf-8"))
    natural_earth = [feature["properties"] for feature in simplified["features"]]
    geometries = [feature["geometry"] for feature in simplified["features"]]
    assert len(natural_earth) == len(geometries), (len(natural_earth), len(geometries))

    source = json.loads(COUNTRIES.read_text(encoding="utf-8"))
    catalog = []
    by_iso3 = {}
    for country in source:
        alpha2, alpha3 = country.get("cca2", ""), country.get("cca3", "")
        latlng = country.get("latlng", [])
        if len(alpha2) != 2 or len(alpha3) != 3 or len(latlng) < 2:
            continue
        item = {"id": alpha2.lower(), "iso3": alpha3, "name": korean_name(country),
                "en": country.get("name", {}).get("common", alpha3),
                "aliases": aliases_for(country),
                "lat": round(float(latlng[0]), 4), "lng": round(float(latlng[1]), 4)}
        override = CATALOG_OVERRIDES.get(item["id"], {})
        item.update({key: override[key] for key in ("name", "lat", "lng") if key in override})
        item["aliases"] = list(dict.fromkeys([*item["aliases"], *override.get("aliases", [])]))
        catalog.append(item)
        by_iso3[alpha3] = item
    catalog.sort(key=lambda item: item["id"])

    features, duplicate_iso3, missing_iso3 = [], [], []
    seen = set()
    for row, raw_geometry in zip(natural_earth, geometries):
        # ADM0_A3 is Natural Earth's country identity; ISO_A3 may be -99 for a
        # handful of disputed/legacy records, so use ADM0_A3 first.
        iso3 = row.get("ADM0_A3", "")
        if iso3 not in by_iso3:
            iso3 = row.get("ISO_A3", "")
        # Natural Earth uses a non-ISO Kosovo code; the catalog keeps its
        # stable UNK territory identifier behind the familiar `xk` ID.
        if iso3 not in by_iso3 and row.get("ADMIN") == "Kosovo":
            iso3 = "UNK"
        if iso3 not in by_iso3:
            missing_iso3.append({"ne": row.get("ADMIN"), "iso3": iso3})
            features.append({"type": "Feature", "properties": {
                "id": "ne-" + row.get("ADMIN", "unknown").lower().replace(" ", "-"),
                "name": row.get("ADMIN", "Unknown"), "contextOnly": True},
                "geometry": geometry_for(raw_geometry)})
            continue
        if iso3 in seen:
            duplicate_iso3.append(iso3)
            continue
        seen.add(iso3)
        features.append({"type": "Feature", "properties": {"id": by_iso3[iso3]["id"]},
                         "geometry": geometry_for(raw_geometry)})

    matched = {feature["properties"]["id"] for feature in features}
    no_geometry = [item["id"] for item in catalog if item["id"] not in matched]
    meta = {
        "schema": "AllEarthGeo/1",
        "generated": str(date.today()),
        "naturalEarth": {"dataset": "ne_50m_admin_0_countries", "version": "5.1.2", "scale": "1:50m",
                           "source": "https://www.naturalearthdata.com/", "license": "public domain"},
        "simplification": {"tool": "mapshaper", "method": "shared-arc Visvalingam simplification", "retain": "10%", "keepShapes": True,
                           "coordinatePrecision": 4, "source": "ne_50m_admin_0_countries_simplified.geojson"},
        "catalog": {"dataset": "mledoze/countries", "version": "c2ac0049c14edcf2436c7aa1b2493222a020b462",
                    "source": "https://github.com/mledoze/countries/blob/c2ac0049c14edcf2436c7aa1b2493222a020b462/countries.json",
                    "license": "ODbL-1.0"},
        "counts": {"catalog": len(catalog), "iso3166Assigned": 249, "nonIsoCatalog": 1, "features": len(features), "catalogWithoutGeometry": len(no_geometry),
                   "unmatchedNaturalEarth": len(missing_iso3), "duplicateNaturalEarth": len(duplicate_iso3)},
        "catalogWithoutGeometry": no_geometry,
        "unmatchedNaturalEarth": missing_iso3,
    }
    payload = {"countries": catalog, "features": features, "meta": meta}
    OUTPUT.write_text("/* Generated by generate_countries.py; see SOURCES.md. */\nwindow.AllEarthGeo=" +
                      json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
    print(json.dumps(meta["counts"], ensure_ascii=False))
    print("bytes", OUTPUT.stat().st_size)


if __name__ == "__main__":
    main()
