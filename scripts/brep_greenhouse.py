"""Greenhouse design-sheet interpretation; centimeters, inferred dimensions."""
import math


def build_parts(sm):
    parts = []
    front, depth = -250, 500
    white, dark, lime = (.83, .83, .79), (.08, .10, .11), (.43, .56, .15)
    yellow, brick = (.86, .49, .045), (.46, .20, .12)

    def add(name, body, color, opacity=1):
        if not body.is_manifold_solid():
            raise RuntimeError(f"{name}: non-manifold CAD part")
        parts.append(dict(name=name, brep=body, color=color, opacity=opacity))
        return body

    def box(name, at, size, color, **kwargs):
        return add(name, sm.create_box(at, *size), color, **kwargs)

    def beam(name, a, b, radius, color):
        delta = [b[i] - a[i] for i in range(3)]
        length = math.sqrt(sum(v * v for v in delta))
        body = sm.create_cylinder(a, radius, length)
        if abs(delta[0]) + abs(delta[1]) > 1e-8:
            sm.rotate(body, a, (-delta[1], delta[0], 0), math.degrees(math.acos(delta[2] / length)))
        add(name, body, color)

    def profile(name, points, thickness, color):
        curves = [sm.create_line_segment(point, points[(index + 1) % len(points)])
                  for index, point in enumerate(points)]
        return add(name, sm.linear_sweep(curves, (0, 1, 0), thickness, cap_ends=True), color)

    # Separate hollow volumes with actual cut window openings.
    left = sm.create_box((-390, front, 40), 300, depth, 560)
    left = sm.boolean_difference(left, sm.create_box((-372, front + 18, 55), 264, depth - 36, 560))
    left = sm.boolean_difference(left, sm.create_box((-320, front - 5, 150), 110, 30, 110))
    add("left_stucco_wing", left, white)
    right = sm.create_box((90, front, 40), 380, depth, 610)
    right = sm.boolean_difference(right, sm.create_box((108, front + 18, 55), 344, depth - 36, 630))
    right = sm.boolean_difference(right, sm.create_box((322, front - 5, 478), 115, 30, 105))
    for z in range(290, 650, 44):
        right = sm.boolean_difference(right, sm.create_box((90, front - 1, z), 380, 2, 1.4))
    add("right_scored_cladding_wing", right, white)
    box("left_floor", (-372, front + 18, 48), (264, depth - 36, 10), (.29, .28, .25))
    box("right_floor", (108, front + 18, 48), (344, depth - 36, 10), (.29, .28, .25))
    for name, x, z, width, height in (("left", -320, 150, 110, 110), ("upper", 322, 478, 115, 105)):
        box(f"{name}_glass", (x + 5, front + 6, z + 5), (width - 10, 2, height - 10),
            (.16, .25, .29), opacity=.55)
        for offset in (0, width - 5):
            box(f"{name}_window_jamb_{offset}", (x + offset, front - 5, z), (5, 13, height), white)
        for offset in (0, height - 5):
            box(f"{name}_window_rail_{offset}", (x, front - 5, z + offset), (width, 13, 5), white)
        box(f"{name}_window_mullion", (x + width / 2, front - 4, z + 5), (3, 8, height - 10), white)
        canopy = sm.create_box((x - 8, front - 42, z + height + 15), width + 16, 47, 5)
        sm.rotate(canopy, (x, front, z + height + 15), (1, 0, 0), 15)
        add(f"{name}_lime_window_canopy", canopy, lime)
        box(f"{name}_window_canopy_valance", (x - 8, front - 43, z + height + 2), (width + 16, 3, 13), lime)
    # Upper flowerbox and thin guard rail are three dimensional.
    box("upper_flowerbox_tray", (316, front - 24, 472), (127, 32, 6), white)
    for offset in range(0, 128, 20):
        beam(f"flowerbox_guard_{offset}", (316 + offset, front - 28, 476), (316 + offset, front - 28, 490), 1.2, white)
    beam("flowerbox_top_rail", (316, front - 28, 490), (443, front - 28, 490), 1.3, white)
    for i in range(12):
        add(f"flower_leaf_{i}", sm.create_sphere((323 + i * 10, front - 11, 487), 5), (.18, .35, .12))
        add(f"flower_blossom_{i}", sm.create_sphere((323 + i * 10, front - 14, 493), 3), (.78, .36 + (i % 2) * .12, .47))
    # Gable roof left, flat roof right, and ribbed fascias.
    profile("left_gabled_roof", [(-402, front - 12, 600), (-240, front - 12, 646),
                                  (-78, front - 12, 600)], depth + 24, dark)
    for i in range(16):
        x = -398 + i * 21
        z = 600 + max(0, 1 - abs(x + 240) / 162) * 46
        beam(f"gable_roof_seam_{i}", (x, front - 12, z + 1), (x, depth / 2 + 12, z + 1), 1.1, dark)
    box("left_front_fascia", (-402, front - 16, 567), (324, 10, 34), dark)
    box("right_flat_roof", (78, front - 12, 650), (404, depth + 24, 9), dark)
    box("right_front_fascia", (78, front - 16, 616), (404, 10, 35), dark)
    for name, x, width, z in (("left", -402, 324, 570), ("right", 78, 404, 619)):
        for i in range(int(width / 15)):
            box(f"{name}_fascia_rib_{i}", (x + i * 15, front - 17, z), (1.2, 2, 28), (.15, .17, .18))
    box("left_corner_trim", (-394, front - 4, 40), (8, 9, 530), dark)
    box("upper_connector", (-90, -35, 460), (180, 250, 30), white)
    for i in range(4):
        beam(f"connector_roof_post_{i}", (-83 + i * 55, -38, 490), (-83 + i * 55, -38, 550), 1.4, white)
    for z in (510, 533, 550):
        beam(f"connector_roof_bar_{z}", (-83, -38, z), (82, -38, z), 1.3, white)
    # Recessed entrance rather than a facade painted on a solid box.
    rear = sm.create_box((-90, -100, 40), 180, 18, 420)
    rear = sm.boolean_difference(rear, sm.create_box((-60, -105, 155), 105, 30, 205))
    add("entry_recess_wall", rear, (.10, .12, .11))
    box("recessed_entry_door", (-58, -92, 156), (101, 5, 201), (.11, .16, .15))
    box("entry_door_glass", (-50, -97, 228), (83, 3, 117), (.17, .26, .25), opacity=.5)
    box("entry_landing", (-68, -339, 145), (126, 246, 10), yellow)
    for i in range(8):
        x, z = 38 + i * 19, 145 - i * 14
        box(f"yellow_stair_tread_{i}", (x, -335, z), (22, 85, 4), yellow)
        for side in (-334, -251):
            beam(f"stair_baluster_{i}_{abs(side)}", (x + 6, side, z), (x + 6, side, z + 88), 1.5, yellow)
    for y in (-334, -251):
        beam(f"stair_handrail_{abs(y)}", (44, y, 233), (177, y, 135), 2.3, yellow)
        beam(f"stair_stringer_{abs(y)}", (36, y, 144), (183, y, 39), 4.0, yellow)
    for x in range(-65, 35, 20):
        beam(f"landing_front_rail_{x + 70}", (x, -339, 155), (x, -339, 246), 1.6, yellow)
    beam("landing_front_handrail", (-66, -339, 246), (34, -339, 246), 2.2, yellow)
    for i, (x, y) in enumerate(((-66, -339), (34, -339), (45, -251), (-66, -137))):
        box(f"yellow_lantern_post_{i}", (x - 3, y - 3, 145), (6, 6, 114), yellow)
        box(f"entry_lantern_glass_bulb_{i}", (x - 6, y - 6, 260), (12, 12, 18), (.95, .77, .43))
        box(f"entry_lantern_cap_{i}", (x - 8, y - 8, 279), (16, 16, 3), yellow)
    canopy = sm.create_box((-99, -320, 382), 198, 180, 3)
    sm.rotate(canopy, (-99, -140, 382), (1, 0, 0), 19)
    add("tan_entry_retractable_canopy", canopy, (.42, .34, .15))
    for x in (-98, 98):
        beam(f"entry_canopy_arm_{x + 100}", (x, -140, 382), (x, -313, 324), 1.6, (.30, .30, .22))
    # Side terrace and the colorful block wall are part of the visible silhouette.
    box("terrace_platform", (-555, front, 40), (165, 350, 100), brick)
    colors = [(.62, .23, .08), (.12, .43, .32), (.81, .62, .13), (.13, .39, .46)]
    for row in range(4):
        for col in range(6):
            box(f"terrace_color_block_{row}_{col}", (-555 + col * 27, front - 2, 42 + row * 24),
                (26, 3, 23), colors[(row * 3 + col) % 4])
    for i in range(9):
        beam(f"terrace_rail_{i}", (-550 + i * 19, front - 3, 141), (-550 + i * 19, front - 3, 251), 1.7, lime)
    for z in (145, 251):
        beam(f"terrace_crossbar_{z}", (-552, front - 3, z), (-393, front - 3, z), 2.2, lime)
    for i in range(12):
        awning = sm.create_box((-565 + i * 15, -280, 363), 15, 210, 3)
        sm.rotate(awning, (-565, -70, 363), (1, 0, 0), 24)
        add(f"striped_terrace_awning_{i}", awning, lime if i % 2 else (.79, .72, .41))
    for x in (-550, -396):
        beam(f"terrace_awning_support_{abs(x)}", (x, -256, 140), (x, -256, 280), 2, lime)
    # Painted utility volumes and physical AC unit.
    box("painted_town_utility_tall", (-213, front - 30, 44), (82, 39, 136), (.25, .43, .36))
    box("painted_town_utility_low", (-300, front - 29, 44), (84, 35, 72), (.42, .48, .23))
    box("air_conditioner", (-380, front - 28, 45), (63, 30, 61), (.62, .64, .59))
    fan = sm.create_cylinder((-349, front - 29, 76), 23, 2)
    sm.rotate(fan, (-349, front - 29, 76), (1, 0, 0), 90)
    add("ac_fan_grille", fan, (.27, .30, .28))
    # Checkerboard base and brick retaining wall, including the stair opening.
    for i in range(29):
        for row in range(2):
            box(f"checker_tile_{row}_{i}", (-80 + i * 18, front - 3, 40 + row * 15),
                (18, 4, 15), (.12, .33, .16) if (i + row) % 2 else (.35, .63, .095))
    for start, end in ((-565, 148), (199, 490)):
        box(f"brick_retaining_core_{start + 600}", (start, -355, 0), (end - start, 25, 39), (.33, .30, .25))
        for row in range(3):
            for col in range(int((end - start) / 24)):
                x = start + col * 24 + (row % 2) * 12
                if x + 23 < end:
                    box(f"front_brick_{start + 600}_{row}_{col}", (x, -357, 1 + row * 12.5), (23, 3, 11.5), brick)
    # VITO relief frame and a genuinely hollow bowl below it.
    for x in (326, 445):
        box(f"portrait_frame_side_{x}", (x, front - 4, 81), (5, 8, 217), (.44, .24, .11))
    for z in (81, 293):
        box(f"portrait_frame_horizontal_{z}", (326, front - 4, z), (124, 8, 5), (.44, .24, .11))
    bowl = sm.create_cylinder((385, -310, 42), 57, 35)
    bowl = sm.boolean_difference(bowl, sm.create_cylinder((385, -310, 52), 44, 40))
    add("stone_water_basin", bowl, (.39, .37, .23))
    add("basin_water", sm.create_cylinder((385, -310, 56), 43, 1), (.17, .32, .28), opacity=.65)
    for i in range(8):
        angle = i * math.pi / 4
        add(f"basin_rim_stone_{i}", sm.create_sphere((385 + 49 * math.cos(angle), -310 + 49 * math.sin(angle), 74), 10), (.42, .37, .22))
    for i in range(2):
        box(f"wall_meter_{i}", (452, front - 5, 230 + i * 30), (14, 9, 25), (.64, .65, .61))
    beam("right_downpipe", (465, front - 5, 40), (465, front - 5, 620), 2, white)
    # Two small seated wooden figures underneath the left sign.
    box("puppet_shelf", (-282, front - 15, 381), (90, 20, 5), (.32, .20, .10))
    for i, x in enumerate((-260, -220)):
        add(f"puppet_head_{i}", sm.create_sphere((x, front - 13, 422), 7), (.63, .46, .25))
        box(f"puppet_body_{i}", (x - 6, front - 18, 391), (12, 11, 25), (.09, .28, .42) if i == 0 else (.74, .42, .08))
        for side in (-4, 4):
            beam(f"puppet_leg_{i}_{side + 4}", (x + side, front - 17, 392), (x + side, front - 30, 375), 2, (.27, .16, .08))
    return parts
