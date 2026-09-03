import { z } from 'zod';
import { CURRENT_FEATURE_INTRO_VERSION } from '../constants/feature-intro';

export const FeatureIntroStateSchema = z.object({
  introVersion: z.string(),
  shouldShowWhatsNew: z.boolean(),
  tourCompleted: z.boolean(),
  tourSkipped: z.boolean(),
  suppressAll: z.boolean(),
});

export type FeatureIntroStateDto = z.infer<typeof FeatureIntroStateSchema>;

export const FeatureIntroDismissRequestSchema = z.object({
  mode: z.enum(['close', 'never']),
});

export type FeatureIntroDismissRequest = z.infer<typeof FeatureIntroDismissRequestSchema>;

export const FeatureIntroTourUpdateSchema = z.object({
  completed: z.boolean().optional(),
  skipped: z.boolean().optional(),
  reset: z.boolean().optional(),
});

export type FeatureIntroTourUpdate = z.infer<typeof FeatureIntroTourUpdateSchema>;

export function defaultFeatureIntroState(): FeatureIntroStateDto {
  return {
    introVersion: CURRENT_FEATURE_INTRO_VERSION,
    shouldShowWhatsNew: true,
    tourCompleted: false,
    tourSkipped: false,
    suppressAll: false,
  };
}
