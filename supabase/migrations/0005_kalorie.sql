-- Faza 5. Cel kaloryczny wolno rewidować najwyżej co 14 dni, więc stan programu
-- musi pamiętać, kiedy zmieniono go ostatnio. Bez tego jedyną obroną przed codziennym
-- majstrowaniem przy celu byłby interfejs, a ten łatwo obejść.
alter table system.program_state
  add column if not exists goal_revised_on date;

comment on column system.program_state.goal_revised_on is
  'Data ostatniej rewizji celu kalorycznego. Null = cel nigdy nie był rewidowany.';
