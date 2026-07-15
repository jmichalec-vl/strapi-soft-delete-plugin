import { createRequire } from 'node:module';
import path from 'node:path';

import type { Core } from '@strapi/types';
import { errors as bundledErrors } from '@strapi/utils';

type StrapiUtilsErrors = typeof bundledErrors;

let cachedErrors: StrapiUtilsErrors | null = null;

/**
 * Resolve the HOST application's `@strapi/utils` error classes.
 *
 * Strapi's error middleware matches thrown errors with `instanceof` against ITS
 * module instance of `@strapi/utils`. The plugin bundle ships its own copy of
 * those classes, so errors constructed from the bundled copy would fail the
 * `instanceof` checks and surface as HTTP 500 instead of 400/403. Constructing
 * them from the host app's module instance keeps error formatting intact.
 */
export const getHostErrors = (strapi: Core.Strapi): StrapiUtilsErrors => {
  if (cachedErrors) return cachedErrors;

  try {
    const requireFromApp = createRequire(path.join(strapi.dirs.app.root, 'package.json'));
    cachedErrors = (requireFromApp('@strapi/utils') as { errors: StrapiUtilsErrors }).errors;
  } catch {
    cachedErrors = bundledErrors;
  }

  return cachedErrors;
};
