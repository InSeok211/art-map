# Adapted from NVIDIA USD BRep tools/scripts/example_generate_asset.py.
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
"""Parametric CAD building using NVIDIA USD BRep's official asset example.

Run through `npm run build:brep-building`; all CAD dimensions are centimeters.
Requires a built USD BRep checkout, supplied by --repo.
"""
import argparse
import json
import math
import os
import sys
from pathlib import Path


def positive(value):
    number = float(value)
    if not math.isfinite(number) or number <= 0:
        raise argparse.ArgumentTypeError("dimensions must be finite and positive")
    return number


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--width", type=positive, default=6.0, help="meters, minimum 4")
    parser.add_argument("--depth", type=positive, default=4.0, help="meters, minimum 3")
    parser.add_argument("--floor-height", type=positive, default=3.0, help="meters, minimum 2.5")
    parser.add_argument("--building", choices=("demo", "domido", "greenhouse"), default="demo")
    parser.add_argument("--detail", choices=("photo", "design"), default="photo")
    args = parser.parse_args()
    if args.width < 4 or args.depth < 3 or args.floor_height < 2.5:
        parser.error("width >= 4, depth >= 3, floor-height >= 2.5 required for the demo openings")
    repo = args.repo.resolve()
    build = repo / "_build" / "windows-x86_64" / "release"
    usd = repo / "_build" / "target-deps" / "usd" / "release"
    sys.path[:0] = [str(build), str(usd / "lib" / "python")]
    # Keep handles alive for Python 3.8+ native DLL loading. Unlike the official
    # viewer, this adapted asset writer needs neither NumPy nor PyVista.
    dll_handles = [os.add_dll_directory(str(directory)) for directory in
                   (build, usd / "lib", usd / "bin", repo / "_build" / "target-deps" / "python")]
    import _omni_solid as sm
    from pxr import Usd, UsdGeom, Sdf, Vt, Gf
    width, depth, floor = args.width * 100, args.depth * 100, args.floor_height * 100
    height, wall = floor * 2, 20
    parts = []

    def add(name, body, color):
        if not body.is_manifold_solid():
            raise RuntimeError(f"{name}: CAD result is not a manifold solid")
        parts.append({"name": name, "brep": body, "color": color})

    def box(at, size):
        return sm.create_box(at, *size)

    # Boolean operands are consumed. Only reuse the returned handle.
    body = box((-width / 2, -depth / 2, 0), (width, depth, height))
    body = sm.boolean_difference(body, box((-width / 2 + wall, -depth / 2 + wall, -10),
                                          (width - 2 * wall, depth - 2 * wall, height + 20)))
    body = sm.boolean_difference(body, box((-55, -depth / 2 - 10, -10), (110, wall + 20, 230)))
    for level in range(2):
        for side in (-1, 1):
            x, z = side * width * 0.29 - 55, floor * level + 95
            body = sm.boolean_difference(body, box((x, -depth / 2 - 10, z), (110, wall + 20, 115)))
            add(f"window_{level}_{'left' if side < 0 else 'right'}",
                box((x + 4, -depth / 2 + 8, z + 4), (102, 4, 107)), (0.25, 0.48, 0.57))
    add("walls_with_openings", body, (0.78, 0.64, 0.48))
    add("foundation", box((-width / 2 - 10, -depth / 2 - 10, 0), (width + 20, depth + 20, 15)),
        (0.45, 0.46, 0.44))
    add("upper_floor", box((-width / 2, -depth / 2, floor), (width, depth, 15)), (0.68, 0.68, 0.63))
    add("roof", box((-width / 2 - 15, -depth / 2 - 15, height), (width + 30, depth + 30, 18)),
        (0.20, 0.40, 0.46))
    add("door", box((-49, -depth / 2 + 8, 15), (98, 6, 200)), (0.25, 0.20, 0.16))
    for side in (-1, 1):
        side_name = "back" if side < 0 else "front"
        for index in range(7):
            add(f"railing_{side_name}_{index}",
                sm.create_cylinder((-width / 2 + index * width / 6, side * depth / 2, height + 18), 3, 85),
                (0.25, 0.27, 0.28))
        add(f"handrail_{side_name}", box((-width / 2 - 3, side * depth / 2 - 3, height + 100),
                                    (width + 6, 6, 6)), (0.25, 0.27, 0.28))

    stem, root_name = "gamcheon-brep-building", "GamcheonBrepBuilding"
    if args.building == "domido":
        from brep_domido import build_parts
        parts = build_parts(sm, detail=args.detail)
        stem, root_name = "domido", "Domido"
        if args.detail == "design":
            stem, root_name = "domido-design", "DomidoDesign"
    args.output.mkdir(parents=True, exist_ok=True)
    if args.building == "greenhouse":
        from brep_greenhouse import build_parts
        parts = build_parts(sm)
        stem, root_name = "greenhouse-design", "GreenhouseDesign"
    for part in parts:
        poly = sm.tessellate(part["brep"], chord_height_tolerance=0.5,
                             curve_angle_tolerance_deg=20, surface_angle_tolerance_deg=20)
        part["mesh"] = poly.to_mesh_arrays(face_varying_normals=True)
    usd_path = args.output / f"{stem}.usda"
    # Mesh-only USD writer adapted from the official asset example.
    stage = Usd.Stage.CreateInMemory()
    UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.z)
    UsdGeom.SetStageMetersPerUnit(stage, 0.01)
    root = UsdGeom.Xform.Define(stage, f"/{root_name}")
    stage.SetDefaultPrim(root.GetPrim())
    for part in parts:
        mesh = part["mesh"]
        prim = UsdGeom.Mesh.Define(stage, f"/{root_name}/{part['name']}")
        prim.CreatePointsAttr(Vt.Vec3fArray([Gf.Vec3f(*point) for point in mesh["points"]]))
        counts, indices, cursor = [], [], 0
        while cursor < len(mesh["faces"]):
            count = int(mesh["faces"][cursor])
            counts.append(count)
            indices.extend(int(index) for index in mesh["faces"][cursor + 1:cursor + 1 + count])
            cursor += count + 1
        prim.CreateFaceVertexCountsAttr(Vt.IntArray(counts))
        prim.CreateFaceVertexIndicesAttr(Vt.IntArray(indices))
        normals = mesh.get("normals")
        if normals and len(normals) == len(indices):
            prim.CreateNormalsAttr(Vt.Vec3fArray([Gf.Vec3f(*normal) for normal in normals]))
            prim.SetNormalsInterpolation(UsdGeom.Tokens.faceVarying)
        prim.CreateSubdivisionSchemeAttr(UsdGeom.Tokens.none)
        color = UsdGeom.PrimvarsAPI(prim).CreatePrimvar("displayColor", Sdf.ValueTypeNames.Color3fArray,
                                                     interpolation=UsdGeom.Tokens.constant)
        color.Set(Vt.Vec3fArray([Gf.Vec3f(*part["color"])]))
    stage.GetRootLayer().Export(str(usd_path))
    payload = {"metersPerUnit": 0.01, "upAxis": "Z", "parts": [
        {"name": p["name"], "color": p["color"], "mesh": p["mesh"], "opacity": p.get("opacity", 1)} for p in parts]}
    (args.output / f"{stem}.mesh.json").write_text(json.dumps(payload), encoding="utf-8")
    print(f"CAD validation passed: {len(parts)} manifold parts; USD and mesh arrays written to {args.output}")


if __name__ == "__main__":
    main()
