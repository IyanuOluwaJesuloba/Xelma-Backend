/**
 * Hackathon / demo entrypoint (`npm run dev:hackathon`).
 *
 * HTTP wiring lives in `src/app-factory.ts`; this file only selects the mode.
 * See CONTRIBUTING.md for the feature-flag matrix.
 */
import { Application } from 'express';
import {
  createApp as createAppFromFactory,
  AppFeatures,
  CreateAppOptions as FactoryOptions,
} from './app-factory';

export interface CreateAppOptions {
  includeErrorHandlers?: boolean;
  /** Per-flag overrides on top of the hackathon defaults. Mainly for tests. */
  features?: Partial<AppFeatures>;
}

export function createApp(options: CreateAppOptions = {}): Application {
  const factoryOptions: FactoryOptions = {
    ...options,
    mode: 'hackathon',
  };
  return createAppFromFactory(factoryOptions);
}

const app = createApp();
export default app;
