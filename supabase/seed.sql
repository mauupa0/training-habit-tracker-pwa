-- =====================================================================
-- System - seed planu treningowego
-- 27 ćwiczeń · 4 szablony dni · 30 pozycji w szablonach
-- Referencje przez slug/key, nie przez UUID - seed jest idempotentny.
-- =====================================================================

-- ============ ĆWICZENIA ============
insert into system.exercises (slug, name_pl, muscle_group, is_compound, increment_kg, is_unilateral, source_ref, notes_pl) values
  ('bench_press',       'Wyciskanie sztangi na ławce płaskiej', 'klatka',       true,  2.5, false, null, null),
  ('barbell_row',       'Wiosłowanie sztangą w opadzie',        'plecy',        true,  2.5, false, null, null),
  ('db_shoulder_press', 'Wyciskanie hantli nad głowę siedząc',  'barki',        true,  2.5, false, null, null),
  ('lat_pulldown',      'Ściąganie drążka wyciągu górnego',     'plecy',        true,  2.5, false, null, null),
  ('cable_fly',         'Rozpiętki na wyciągu',                 'klatka',       false, 2.5, false, null, null),
  ('lateral_raise',     'Wznosy bokiem',                        'barki',        false, 2.5, false, null, null),
  ('db_curl',           'Uginanie ramion ze sztangielkami',     'biceps',       false, 2.5, false, null, null),
  ('overhead_ext',      'Wyciskanie francuskie zza głowy',      'triceps',      false, 2.5, false, 'maeo2023',
   'Zza głowy, nie pushdown. Głowa długa tricepsa czepia się łopatki, przy ramieniu wzdłuż tułowia pozostaje krótka.'),
  ('back_squat',        'Przysiad ze sztangą z tyłu',           'czworogłowe',  true,  5,   false, 'kubo2019',
   'Pełny zakres. Czworogłowe rosną tak samo przy 90°, ale pośladki i przywodziciele wyraźnie lepiej przy pełnym.'),
  ('leg_press',         'Wypychanie ciężaru na suwnicy',        'czworogłowe',  true,  5,   false, null, null),
  ('rdl',               'Rumuński martwy ciąg',                 'dwugłowe uda', true,  5,   false, 'kubo2019', null),
  ('leg_extension',     'Prostowanie nóg na maszynie',          'czworogłowe',  false, 5,   false, null, null),
  ('seated_leg_curl',   'Uginanie nóg siedząc',                 'dwugłowe uda', false, 5,   false, 'maeo2021',
   'Wariant siedzący, nie leżący. Trzy z czterech głów są dwustawowe - siedząc startują z większego rozciągnięcia.'),
  ('standing_calf',     'Wspięcia na palce stojąc',             'łydki',        false, 5,   false, 'kinoshita2023',
   'Stojąc, nie siedząc. Brzuchaty łydki przechodzi nad kolanem - zgięte kolano go wyłącza.'),
  ('core_a',            'Deska bokiem / allahy na wyciągu',     'brzuch',       false, 2.5, false, null, null),
  ('pull_up',           'Podciąganie na drążku',                'plecy',        true,  2.5, false, null, null),
  ('incline_db_press',  'Wyciskanie hantli, skos dodatni',      'klatka',       true,  2.5, false, null, null),
  ('one_arm_row',       'Wiosłowanie hantlem jednorącz',        'plecy',        true,  2.5, false, null, null),
  ('ohp',               'Wyciskanie żołnierskie stojąc',        'barki',        true,  2.5, false, null, null),
  ('face_pull',         'Face pull / odwodzenie w opadzie',     'barki tylne',  false, 2.5, false, null, null),
  ('preacher_curl',     'Uginanie ramion na modlitewniku',      'biceps',       false, 2.5, false, null, null),
  ('dips',              'Pompki na poręczach',                  'triceps',      true,  2.5, false, null, null),
  ('deadlift',          'Martwy ciąg klasyczny',                'plecy',        true,  5,   false, null, null),
  ('bulgarian_split',   'Przysiad bułgarski',                   'czworogłowe',  true,  5,   true,  null, null),
  ('hip_thrust',        'Hip thrust ze sztangą',                'pośladki',     true,  5,   false, 'plotkin2023',
   'Najsłabszy punkt planu. Jeśli musisz coś wyciąć przy braku czasu - to jako pierwsze.'),
  ('hack_squat',        'Hack przysiad / wypychanie wąsko',     'czworogłowe',  true,  5,   false, null, null),
  ('core_b',            'Brzuch - wybór',                       'brzuch',       false, 2.5, false, null, null)
on conflict (slug) do nothing;

-- ============ SZABLONY DNI ============
insert into system.workout_templates (key, name_pl, subtitle_pl, position) values
  ('upper_a', 'Upper A', null,                    1),
  ('lower_a', 'Lower A', 'dominacja kolanowa',    2),
  ('upper_b', 'Upper B', 'dominacja ciągnięcia',  3),
  ('lower_b', 'Lower B', 'dominacja biodrowa',    4)
on conflict (key) do nothing;

-- ============ ZAWARTOŚĆ DNI ============
-- position 1 i 2 = zestaw trybu minimum (R2)
-- brzuch: rep_min = rep_max = 0, target_rir null → UI pokazuje "3 serie, bez przedziału"
insert into system.template_exercises
  (template_id, exercise_id, position, target_sets, rep_min, rep_max, target_rir, rest_seconds)
select t.id, e.id, v.position, v.target_sets, v.rep_min, v.rep_max, v.target_rir, v.rest_seconds
from (values
  -- UPPER A
  ('upper_a', 'bench_press',       1, 4,  5,  8, '2',   180),
  ('upper_a', 'barbell_row',       2, 4,  6, 10, '2',   180),
  ('upper_a', 'db_shoulder_press', 3, 3,  8, 12, '1-2', 120),
  ('upper_a', 'lat_pulldown',      4, 3,  8, 12, '1-2', 120),
  ('upper_a', 'cable_fly',         5, 3, 12, 15, '1',    90),
  ('upper_a', 'lateral_raise',     6, 4, 12, 20, '0-1',  60),
  ('upper_a', 'db_curl',           7, 4,  8, 12, '1',    90),
  ('upper_a', 'overhead_ext',      8, 3, 10, 15, '1',    90),
  -- LOWER A
  ('lower_a', 'back_squat',        1, 4,  5,  8, '2',   180),
  ('lower_a', 'leg_press',         2, 3, 10, 15, '1-2', 150),
  ('lower_a', 'rdl',               3, 3,  8, 12, '2',   150),
  ('lower_a', 'leg_extension',     4, 3, 12, 20, '0-1',  90),
  ('lower_a', 'seated_leg_curl',   5, 3, 10, 15, '1',    90),
  ('lower_a', 'standing_calf',     6, 4, 10, 15, '0-1',  90),
  ('lower_a', 'core_a',            7, 3,  0,  0, null,   60),
  -- UPPER B
  ('upper_b', 'pull_up',           1, 4,  6, 10, '2',   180),
  ('upper_b', 'incline_db_press',  2, 4,  8, 12, '2',   180),
  ('upper_b', 'one_arm_row',       3, 3, 10, 15, '1-2', 120),
  ('upper_b', 'ohp',               4, 3,  6, 10, '2',   120),
  ('upper_b', 'face_pull',         5, 3, 15, 20, '0-1',  60),
  ('upper_b', 'lateral_raise',     6, 4, 12, 20, '0-1',  60),
  ('upper_b', 'preacher_curl',     7, 3, 10, 15, '1',    90),
  ('upper_b', 'dips',              8, 3,  8, 12, '1',    90),
  -- LOWER B
  ('lower_b', 'deadlift',          1, 3,  4,  6, '2-3', 240),
  ('lower_b', 'bulgarian_split',   2, 3,  8, 12, '2',   120),
  ('lower_b', 'hip_thrust',        3, 3,  8, 12, '1-2', 120),
  ('lower_b', 'seated_leg_curl',   4, 3, 12, 15, '0-1',  90),
  ('lower_b', 'hack_squat',        5, 3, 10, 15, '1',   120),
  ('lower_b', 'standing_calf',     6, 4, 12, 20, '0-1',  90),
  ('lower_b', 'core_b',            7, 3,  0,  0, null,   60)
) as v(tkey, eslug, position, target_sets, rep_min, rep_max, target_rir, rest_seconds)
join system.workout_templates t on t.key = v.tkey
join system.exercises e on e.slug = v.eslug
on conflict (template_id, position) do nothing;
