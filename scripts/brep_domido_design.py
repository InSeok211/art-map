"""CAD details interpreted from domido-reference-sheet-v1.png, not measured."""


def enhance(sm, parts, front, add, box, beam):
    wood = (.23, .13, .075)
    dark = (.12, .075, .05)
    silver = (.55, .57, .52)
    # Layered timber frames, recessed liners and finer subdivisions.
    for index in range(3):
        x = -452 + index * 145
        for offset in (-4, 129):
            box(f"design_outer_jamb_{index}_{offset + 4}", (x + offset, front - 9, 265),
                (6, 19, 151), wood)
        for level in (265, 410):
            box(f"design_outer_window_rail_{index}_{level}", (x - 4, front - 9, level),
                (139, 19, 6), wood)
        for offset in (19, 63, 105):
            box(f"design_fine_glazing_bar_{index}_{offset}", (x + offset, front - 1, 281),
                (1.2, 4, 122), dark)
        for level in (302, 350, 387):
            box(f"design_glazing_crossbar_{index}_{level}", (x + 7, front - 1, level),
                (115, 4, 1.2), dark)
        box(f"design_window_recess_header_{index}", (x + 7, front + 2, 396), (114, 15, 7), dark)
        box(f"design_sill_drip_{index}", (x - 3, front - 14, 260), (137, 24, 4), wood)
        for offset in (20, 72, 115):
            beam(f"window_pendant_wire_{index}_{offset}", (x + offset, front + 25, 396),
                 (x + offset, front + 25, 370), .35, dark)
            add(f"window_pendant_bulb_{index}_{offset}",
                sm.create_sphere((x + offset, front + 25, 366), 3), (1, .70, .30))

    # Make the upper door aperture an actual CAD opening instead of glazing
    # over an opaque door leaf. Add a lower inset panel and a deep architrave.
    leaf = next(p for p in parts if p["name"] == "entry_door_leaf")
    body = sm.boolean_difference(leaf["brep"], sm.create_box((44, front + 19, 269), 70, 17, 123))
    parts.remove(leaf)
    add("design_door_leaf_with_glazed_opening", body, dark)
    box("design_lower_door_inset", (45, front + 19, 195), (67, 3, 65), wood)
    for x in (26, 127):
        box(f"design_entry_architrave_{x}", (x, front - 10, 175), (7, 24, 236), wood)
    box("design_entry_architrave_header", (26, front - 10, 404), (108, 24, 7), wood)
    box("design_recess_threshold", (32, front - 1, 174), (96, 53, 5), (.31, .27, .22))
    box("design_canopy_front_molding", (8, front - 70, 408), (141, 7, 5), wood)
    box("design_canopy_soffit", (12, front - 58, 409), (132, 80, 4), dark)
    for index in range(3):
        bulb = sm.create_cylinder((78 + index * 61, front - 52, 405 if index == 0 else 447), 3.5, 2)
        sm.rotate(bulb, (78 + index * 61, front - 52, 405 if index == 0 else 447), (1, 0, 0), 180)
        add(f"canopy_downlight_bulb_{index}", bulb, (1, .72, .33))
    add("entry_lamp_bulb", sm.create_sphere((78, front - 90, 451), 3.5), (1, .75, .40))

    for x in (158, 299):
        box(f"design_counter_inner_liner_{x}", (x, front + 1, 295), (5, 28, 133), dark)
    box("design_counter_sill_profile", (143, front - 24, 281), (168, 9, 5), wood)
    box("design_counter_cornice", (151, front - 10, 432), (153, 10, 6), wood)
    # Sheet-metal returns on the awning edges and roof gutter profile.
    for name, x, width, level, projection in (
            ("long_window", -484, 488, 454, 68), ("counter", 139, 173, 492, 78)):
        for edge in (x, x + width - 2):
            trim = sm.create_box((edge, front - projection, level - 4), 2, projection + 5, 7)
            sm.rotate(trim, (x, front, level), (1, 0, 0), 28)
            add(f"design_{name}_awning_return_{int(edge) + 500}", trim, (.10, .22, .14))
        soffit = sm.create_box((x + 2, front - projection + 2, level - 3), width - 4, projection, 2)
        sm.rotate(soffit, (x, front, level), (1, 0, 0), 28)
        add(f"design_{name}_awning_soffit", soffit, dark)
    for name, x, width, level in (("left", -490, 500, 475), ("right", -8, 477, 550)):
        beam(f"design_{name}_gutter", (x, front - 14, level - 3),
             (x + width, front - 14, level - 3), 2.8, dark)

    # Replace simplified straight bars with real round-headed U ornaments.
    parts[:] = [p for p in parts if not p["name"].startswith(("railing_circle_", "railing_vertical_"))]
    for index in range(7):
        x = -465 + index * 62
        road = 65 + (x + 480) * .15
        center = (x + 30, front - 44, road + 66)
        arch = sm.create_partial_torus(center, 22, 1.25, 0, 180)
        sm.rotate(arch, center, (1, 0, 0), 90)
        add(f"design_railing_arch_{index}", arch, silver)
        for side in (-22, 22):
            beam(f"design_railing_upright_{index}_{side + 22}",
                 (x + 30 + side, front - 44, road + 13),
                 (x + 30 + side, front - 44, road + 66), 1.25, silver)
        ring = sm.create_torus((x + 30, front - 44, road + 41), 11.5, 1.15)
        sm.rotate(ring, (x + 30, front - 44, road + 41), (1, 0, 0), 90)
        add(f"design_railing_inset_ring_{index}", ring, silver)
    # The sheet also shows a small projection below the mural.
    box("design_small_wall_plinth", (338, front - 18, 221), (45, 32, 12), (.72, .66, .51))
    box("design_wall_electrical_box", (291, front - 3, 272), (8, 6, 12), (.82, .79, .68))
