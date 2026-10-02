import type { ExerciseKind, RedFlag, Region, RomTiming, Side } from '../db/types';

export const REGION_LABEL: Record<Region, string> = {
  wrist: 'Bilek',
  ankle: 'Ayak bileği',
  knee: 'Diz',
};

export const TIMING_LABEL: Record<RomTiming, string> = { pre: 'Antrenman öncesi', post: 'Antrenman sonrası' };
export const TIMING_SHORT: Record<RomTiming, string> = { pre: 'Öncesi', post: 'Sonrası' };

export const SIDE_LABEL: Record<Side, string> = { left: 'Sol', right: 'Sağ' };

export const KIND_LABEL: Record<ExerciseKind, string> = {
  reps: 'Tekrar',
  hold: 'İzometrik tutuş',
  timed: 'Süreli',
};

export const RED_FLAG_LABEL: Record<RedFlag, string> = {
  sudden_swelling: 'Ani şişlik',
  numbness: 'Uyuşma / karıncalanma',
  night_pain: 'Gece ağrısı',
  locking: 'Kilitlenme',
  giving_way: 'Boşalma hissi',
  warmth_redness: 'Sıcaklık / kızarıklık',
};
