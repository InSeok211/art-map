"""Photo-based Domido facade. Dimensions in cm; unseen depth/rear are estimates."""
import math


def build_parts(sm, depth=440, detail="photo"):
    parts = []
    plaster = (0.72, 0.66, 0.51)
    wood = (0.23, 0.13, 0.075)
    dark_wood = (0.12, 0.075, 0.05)
    green = (0.10, 0.22, 0.14)
    metal = (0.46, 0.48, 0.43)
    front = -depth / 2

    def add(name, body, color, **extra):
        if not body.is_manifold_solid():
            raise RuntimeError(f"{name}: non-manifold CAD part")
        parts.append(dict(name=name, brep=body, color=color, **extra))
        return body

    def box(name, at, size, color, **extra):
        return add(name, sm.create_box(at, *size), color, **extra)

    def profile(name, xz, y, thickness, color):
        points = [(x, y, z) for x, z in xz]
        curves = [sm.create_line_segment(point, points[(i + 1) % len(points)])
                  for i, point in enumerate(points)]
        return add(name, sm.linear_sweep(curves, (0, 1, 0), thickness, cap_ends=True), color)

    def beam(name, a, b, radius, color):
        dx, dy, dz = [b[i] - a[i] for i in range(3)]
        length = math.sqrt(dx * dx + dy * dy + dz * dz)
        body = sm.create_cylinder(a, radius, length)
        if abs(dx) + abs(dy) > 1e-8:
            sm.rotate(body, a, (-dy, dx, 0), math.degrees(math.acos(dz / length)))
        add(name, body, color)

    # Two offset roof levels and separate hollow wings, as seen on the street.
    left = sm.create_box((-480, front, 0), 480, depth, 475)
    left = sm.boolean_difference(left, sm.create_box((-462, front + 18, 180), 444, depth - 36, 310))
    for index in range(3):
        x = -452 + index * 145
        left = sm.boolean_difference(left, sm.create_box((x, front - 5, 275), 128, 30, 130))
        box(f"left_window_glass_{index}", (x + 7, front + 6, 281), (114, 2, 118),
            (0.19, 0.25, 0.23), opacity=0.48)
        for side in (0, 120):
            box(f"left_window_jamb_{index}_{side}", (x + side, front - 6, 272), (8, 14, 137), wood)
        for z in (272, 402):
            box(f"left_window_horizontal_{index}_{z}", (x, front - 6, z), (128, 14, 7), wood)
        for mullion in (43, 84):
            box(f"left_window_mullion_{index}_{mullion}", (x + mullion, front + 2, 280),
                (3, 5, 124), dark_wood)
        box(f"window_transom_{index}", (x + 6, front - 1, 369), (115, 5, 3), dark_wood)
    add("left_plaster_wing", left, plaster)
    box("long_window_sill", (-465, front - 12, 265), (450, 25, 8), wood)
    box("left_floor", (-462, front + 18, 176), (444, depth - 36, 12), (0.42, 0.31, 0.19))

    right = sm.create_box((0, front, 100), 460, depth, 450)
    right = sm.boolean_difference(right, sm.create_box((18, front + 18, 178), 424, depth - 36, 390))
    right = sm.boolean_difference(right, sm.create_box((32, front - 5, 178), 96, 30, 229))
    right = sm.boolean_difference(right, sm.create_box((161, front - 5, 295), 133, 30, 132))
    add("right_plaster_wing", right, plaster)
    box("right_floor", (18, front + 18, 170), (424, depth - 36, 12), (0.35, 0.24, 0.13))
    box("entry_recess_side", (28, front + 5, 177), (7, 34, 230), dark_wood)
    box("entry_door_leaf", (37, front + 24, 182), (84, 6, 217), dark_wood)
    box("entry_door_glass", (44, front + 20, 269), (70, 3, 120), (0.18, 0.24, 0.20), opacity=0.45)
    box("entry_door_crossbar", (37, front + 17, 270), (84, 6, 7), wood)
    box("entry_handle", (109, front + 13, 278), (3, 4, 18), (0.60, 0.58, 0.44))
    for step, z in enumerate((149, 159, 169)):
        box(f"entry_step_{step}", (30, front - 32 + step * 9, z), (100, 43 - step * 9, 10),
            (0.31, 0.27, 0.22))
    for x in (151, 294):
        box(f"counter_jamb_{x}", (x, front - 5, 288), (10, 17, 148), wood)
    box("counter_lintel", (151, front - 5, 427), (153, 17, 9), wood)
    box("counter_dark_recess", (164, front + 55, 299), (127, 3, 125), (0.055, 0.063, 0.052))
    box("service_counter_sill", (145, front - 20, 283), (164, 38, 9), wood)
    box("inner_counter", (160, front + 20, 295), (132, 54, 5), (0.38, 0.25, 0.14))
    for x in (190, 220, 251):
        box(f"coffee_equipment_{x}", (x, front + 33, 300), (19, 19, 23), (0.22, 0.23, 0.21))

    # Brown low-pitch sheet roofs and green, ribbed, projecting awnings.
    for name, x, width, level in (("left", -490, 500, 475), ("right", -8, 477, 550)):
        slab = sm.create_box((x, front - 10, level), width, depth + 24, 8)
        sm.rotate(slab, (x, front, level), (1, 0, 0), 2)
        add(f"{name}_roof", slab, (0.24, 0.11, 0.07))
        box(f"{name}_roof_fascia", (x, front - 12, level - 4), (width, 10, 12), wood)
    for name, x, width, level, projection in (
            ("long_window", -484, 488, 454, 68), ("counter", 139, 173, 492, 78)):
        slab = sm.create_box((x, front - projection, level), width, projection + 5, 4)
        pivot = (x, front, level)
        sm.rotate(slab, pivot, (1, 0, 0), 28)
        add(f"{name}_green_awning", slab, green)
        for index in range(int(width // 5)):
            rib = sm.create_box((x + index * 5, front - projection, level + 4), 1.0, projection + 4, 1.4)
            sm.rotate(rib, pivot, (1, 0, 0), 28)
            add(f"{name}_awning_rib_{index}", rib, (0.14, 0.27, 0.18))

    # Gable profile is extruded through the CAD kernel, including its roof trim.
    profile("entry_wood_gable", [(8, 415), (78, 536), (148, 415)], front - 63, 17, wood)
    for index in range(15):
        x = 10 + index * 9
        top = 536 - abs(x - 78) * 121 / 70
        if top > 420:
            box(f"gable_vertical_board_{index}", (x, front - 64, 416), (6.8, 1.2, top - 417),
                (0.20 + (index % 3) * .018, 0.115, 0.07))
    for side, points in enumerate(([(3, 414), (78, 542), (80, 536), (9, 410)],
                                    [(78, 542), (153, 414), (147, 410), (76, 536)])):
        profile(f"gable_roof_trim_{side}", points, front - 69, 80, dark_wood)
    box("entry_canopy_beam", (8, front - 64, 410), (140, 18, 8), dark_wood)
    box("entry_canopy_post", (18, front - 67, 137), (7, 9, 281), wood)
    beam("lamp_stem", (78, front - 65, 479), (78, front - 90, 479), 1.2, green)
    lamp = sm.create_cone((78, front - 90, 451), 15, 4, 8)
    add("green_entry_lamp", lamp, (0.19, 0.34, 0.24))

    # Silver railing follows the descending sidewalk on the left.
    for index in range(8):
        x = -465 + index * 62
        road = 65 + (x + 480) * .15
        beam(f"railing_post_{index}", (x, front - 44, road), (x, front - 44, road + 91), 2.5, metal)
        add(f"railing_finial_{index}", sm.create_sphere((x, front - 44, road + 94), 4.0), metal)
        if index < 7:
            beam(f"railing_top_{index}", (x, front - 44, road + 85),
                 (x + 62, front - 44, road + 94.3), 2.2, metal)
            beam(f"railing_bottom_{index}", (x, front - 44, road + 8),
                 (x + 62, front - 44, road + 17.3), 1.6, metal)
            ring = sm.create_torus((x + 30, front - 44, road + 48), 17, 1.2)
            sm.rotate(ring, (x + 30, front - 44, road + 48), (1, 0, 0), 90)
            add(f"railing_circle_{index}", ring, metal)
            beam(f"railing_vertical_{index}", (x + 30, front - 44, road + 13),
                 (x + 30, front - 44, road + 82), 1.2, metal)
    # Sparse interior for glimpses through the glazing; no asserted room plan.
    for index in range(3):
        box(f"interior_table_{index}", (-390 + index * 125, front + 40, 247), (65, 65, 5), wood)
        beam(f"table_pedestal_{index}", (-357 + index * 125, front + 73, 183),
             (-357 + index * 125, front + 73, 247), 4, dark_wood)
    if detail == "design":
        from brep_domido_design import enhance
        enhance(sm, parts, front, add, box, beam)
    return parts
