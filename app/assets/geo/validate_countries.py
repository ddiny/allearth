"""Validate the generated AllEarth geography payload without a browser."""
from __future__ import annotations

import json
from pathlib import Path

HERE = Path(__file__).parent

# ISO 3166-1 alpha-2 assignment set (249 codes), captured when this asset was
# built. XK is intentionally excluded: it is the catalog's stable non-ISO
# Kosovo territory code and is tested separately below.
ISO_ALPHA2 = frozenset("""AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW""".split())


def load_payload():
    text = (HERE / "countries.js").read_text(encoding="utf-8")
    return json.loads(text.split("=", 1)[1].rstrip(";\n"))


def ring_area(ring):
    return sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(ring, ring[1:]))


def correctly_wound(geometry):
    polygons = [geometry["coordinates"]] if geometry["type"] == "Polygon" else geometry["coordinates"]
    return all(ring_area(polygon[0]) < 0 and all(ring_area(hole) > 0 for hole in polygon[1:])
               for polygon in polygons)


def valid_rings(geometry):
    polygons = [geometry["coordinates"]] if geometry["type"] == "Polygon" else geometry["coordinates"]
    return all(len(ring) >= 4 and ring[0] == ring[-1] and len({tuple(point) for point in ring[:-1]}) >= 3
               and abs(ring_area(ring)) > 0 for polygon in polygons for ring in polygon)


def main():
    data = load_payload()
    countries, features = data["countries"], data["features"]
    ids = [country["id"] for country in countries]
    id_set = set(ids)
    normal_features = [feature for feature in features if not feature["properties"].get("contextOnly")]
    context_features = [feature for feature in features if feature["properties"].get("contextOnly")]
    feature_ids = [feature["properties"]["id"] for feature in features]
    iso_ids = id_set - {"xk"}
    iso_ids_upper = {item.upper() for item in iso_ids}
    result = {
        "catalog": len(countries),
        "iso3166Assigned": len(iso_ids_upper),
        "nonIso": sorted(id_set - {item.lower() for item in ISO_ALPHA2}),
        "missingIso": sorted(ISO_ALPHA2 - iso_ids_upper),
        "unexpectedIso": sorted(iso_ids_upper - ISO_ALPHA2),
        "features": len(features),
        "catalogFeatures": len(normal_features),
        "contextOnlyFeatures": len(context_features),
        "duplicateFeatureIds": sorted({item for item in feature_ids if feature_ids.count(item) > 1}),
        "catalogWithoutGeometry": data["meta"]["catalogWithoutGeometry"],
    }
    kr = next(country for country in countries if country["id"] == "kr")
    required_aliases = {"kr": "한국", "cn": "중국", "au": "호주", "gb": "UK"}
    alias_ok = all(alias in next(c for c in countries if c["id"] == key)["aliases"]
                   for key, alias in required_aliases.items())
    valid_geometry = all(feature.get("geometry", {}).get("type") in {"Polygon", "MultiPolygon"}
                         for feature in features)
    winding_ok = all(correctly_wound(feature["geometry"]) for feature in features)
    rings_ok = all(valid_rings(feature["geometry"]) for feature in features)
    tiny_ids = {"sg", "va", "mc", "nr", "tv"}
    tiny_shapes_ok = all(any(feature["properties"]["id"] == country_id for feature in normal_features)
                         for country_id in tiny_ids)
    result.update({"winding": winding_ok, "closedValidRings": rings_ok, "tinyCountryShapes": tiny_shapes_ok})
    ok = (len(countries) == 250 and iso_ids_upper == ISO_ALPHA2 and "xk" in id_set
          and len(features) == 242 and len(normal_features) == 237 and len(context_features) == 5
          and not result["duplicateFeatureIds"]
          and all(feature["properties"]["id"] in id_set for feature in normal_features)
          and valid_geometry and winding_ok and rings_ok and tiny_shapes_ok
          and kr["name"] == "대한민국" and kr["lat"] == 36.5 and kr["lng"] == 127.8
          and alias_ok)
    result["ok"] = ok
    print(json.dumps(result, ensure_ascii=True, separators=(",", ":")))
    if not ok:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
