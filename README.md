# Strapi v5 — Soft Delete Plugin

[![npm version](https://img.shields.io/npm/v/strapi-soft-delete-plugin)](https://www.npmjs.com/package/strapi-soft-delete-plugin)
[![npm downloads](https://img.shields.io/npm/dm/strapi-soft-delete-plugin)](https://www.npmjs.com/package/strapi-soft-delete-plugin)
[![CI](https://github.com/jmichalec-vl/strapi-soft-delete-plugin/actions/workflows/ci.yml/badge.svg)](https://github.com/jmichalec-vl/strapi-soft-delete-plugin/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE.md)

Soft delete plugin for Strapi v5 — never lose content again. When you delete an entry, it's marked as deleted instead of being removed from the database. You can restore it or permanently delete it later.

Drop-in replacement for `strapi-plugin-soft-delete` with significant improvements.

## Features

- **Soft delete** — delete operations mark entries instead of removing them
- **Restore** — bring back soft-deleted entries with all relations and components intact
- **Permanent delete** — remove entries from the database with proper component cleanup
- **Soft Delete Explorer** — admin panel page to view, restore, and permanently delete entries
- **Entry preview** — click any entry to see its full content before restoring
- **Pagination & filters** — date range filtering, paginated results
- **RBAC** — granular permissions per content type (read, restore, delete permanently)
- **Settings** — configurable restoration behavior for single types and Draft & Publish
- **Auto-purge** — automatically delete entries older than N days via cron
- **Custom lifecycle hooks** — `beforeSoftDelete`, `afterSoftDelete`, `beforeRestore`, `afterRestore`, `beforeDeletePermanently`, `afterDeletePermanently`
- **Draft & Publish aware** — respects publish state during restore
- **Relation safe** — soft-deleted entries excluded from populated relations
- **Lifecycle safe** — soft-delete/restore do NOT trigger `beforeUpdate`/`afterUpdate` hooks
- **v4 migration** — same database columns, automatic settings migration

## Compatibility

| Strapi Version | Plugin Version                                                                              |
| -------------- | ------------------------------------------------------------------------------------------- |
| ^5.0.0         | 0.x                                                                                         |
| ^4.x           | Use [strapi-plugin-soft-delete](https://github.com/ChristopheCVB/strapi-plugin-soft-delete) |

## Installation

```bash
npm install strapi-soft-delete-plugin
# or
yarn add strapi-soft-delete-plugin
```

Add to your plugin configuration:

```typescript
// config/plugins.ts
export default () => ({
  'soft-delete': {
    enabled: true,
  },
});
```

Rebuild and start:

```bash
npm run build
npm run develop
```

## Configuration

### Auto-Purge (optional)

Automatically permanently delete soft-deleted entries older than a specified number of days:

```typescript
// config/plugins.ts
export default () => ({
  'soft-delete': {
    enabled: true,
    config: {
      autoPurge: {
        enabled: true,
        ttlDays: 30, // permanently delete after 30 days
        cron: '0 2 * * *', // run daily at 2 AM
      },
    },
  },
});
```

Auto-purge uses the same per-document permanent-delete path as the admin's "Delete permanently": components and dynamic zones are cleaned up, the `beforeDeletePermanently`/`afterDeletePermanently` hooks fire, and an `entry.delete` event is emitted per purged entry. Two purge-specific behaviors:

- **Per-document error isolation** — unlike the interactive path (where a hook throw/veto propagates to the caller), a purge failure for one document is caught, logged, and skipped so the unattended cron run never wedges on a single bad document. The failed document is retried on the next run. To veto purging permanently, keep throwing from `beforeDeletePermanently`.
- **Partially-expired documents are skipped** — a document is purged only when ALL of its rows are expired. If some rows are still live or were trashed more recently (e.g. only one locale was deleted), the document is left alone.

## RBAC Permissions

Configure per-role in **Settings → Roles → [Role Name]**:

| Section                   | Permission           | Description                                    |
| ------------------------- | -------------------- | ---------------------------------------------- |
| Collection & Single Types | `Soft Delete`        | Soft delete entries (replaces "Delete")        |
| Collection & Single Types | `Deleted Read`       | View soft-deleted entries in the explorer      |
| Collection & Single Types | `Deleted Restore`    | Restore soft-deleted entries                   |
| Collection & Single Types | `Delete Permanently` | Permanently remove soft-deleted entries        |
| Plugins → Soft Delete     | `Read`               | Access the Soft Delete explorer in the sidebar |
| Plugins → Soft Delete     | `Settings`           | Manage plugin settings                         |

## Settings

### Restoration Behavior

Configure in **Settings → Soft Delete → Restoration Behavior**:

**Single Type Restoration** — when restoring a single type entry that already has an active entry:

- `Soft Delete` — soft-delete the existing active entry (default)
- `Delete Permanently` — permanently delete the existing active entry

**Draft & Publish Restoration** — when restoring an entry from a D&P content type:

- `Unchanged` — preserve the original publish state (default)
- `Draft` — always restore as draft

## Custom Lifecycle Hooks (optional)

The plugin works out of the box without any custom code. If you need to run custom logic during soft-delete operations (e.g., logging, notifications, validation), you can register lifecycle hooks in your application's bootstrap:

```typescript
// src/index.ts
export default {
  async bootstrap({ strapi }) {
    const hooks = strapi.plugin('soft-delete').service('lifecycle-hooks');

    hooks.register('beforeSoftDelete', async ({ uid, documentId, entries, auth }) => {
      console.log(`About to soft-delete ${documentId} from ${uid}`);
      // Return { cancel: true } to prevent the operation,
      // or throw to fail it with your own error
    });

    hooks.register('afterRestore', async ({ uid, documentId, entries, auth }) => {
      console.log(`Restored ${documentId} in ${uid}`);
    });
  },
};
```

Available hooks:

- `beforeSoftDelete` / `afterSoftDelete`
- `beforeRestore` / `afterRestore`
- `beforeDeletePermanently` / `afterDeletePermanently`

### Hook Error Semantics

Since 0.2.0, handler errors and cancellations propagate to the caller instead of being silently swallowed:

| Handler behavior                             | Result                                                                                                                                                                                                                                                                    |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `before*` handler throws                     | Operation aborts; the error propagates to the caller (e.g. `errors.ApplicationError` from `@strapi/utils` → HTTP 400 in the admin)                                                                                                                                        |
| `before*` handler returns `{ cancel: true }` | Operation aborts with a `PolicyError` — `"Operation cancelled by <hookName> hook"` (HTTP 403)                                                                                                                                                                             |
| `before*` returns `{ cancel: true, error }`  | Operation aborts with your `error`                                                                                                                                                                                                                                        |
| `after*` handler throws                      | The error propagates to the caller. For **soft-delete and restore** the operation is **ROLLED BACK** (the write and the `after*` hooks share a plugin-owned transaction). For **permanent delete** the rows are already gone — the error surfaces but nothing is restored |

Notes:

- Handlers run in registration order; the first throw/cancel stops the chain.
- The soft-delete/restore write and its `after*` hooks run inside one plugin-owned transaction, so host cascades are atomic: if your `afterSoftDelete` cascade fails, the parent is NOT left half-trashed. Events (`entry.delete`/`entry.update`) are emitted only after the transaction commits.
- For user-visible messages, throw `errors.ApplicationError` (HTTP 400) or `errors.PolicyError` (HTTP 403) from `@strapi/utils`. A plain `errors.ForbiddenError` reaches the caller as a generic `"Forbidden"` — Strapi's route layer masks its message.

## Programmatic API

Server-side code (bootstrap, cron jobs, other plugins) can drive soft-delete operations through the `api` service:

```typescript
const api = strapi.plugin('soft-delete').service('api');

// Same code path as an intercepted documents().delete — hooks + events fire
await api.softDelete('api::article.article', documentId);

// i18n: soft-delete a single locale — other locales stay live
// (mirrors documents().delete({ documentId, locale }); '*' or omitted = all locales)
await api.softDelete('api::article.article', documentId, { locale: 'fr' });

// Fires beforeRestore/afterRestore; respects restoration-behavior settings
await api.restore('api::article.article', documentId);

// Includes component/dynamic-zone cleanup
await api.deletePermanently('api::article.article', documentId);

// Paginated trash listing (only soft-deleted documents)
const trashed = await api.findSoftDeleted('api::article.article', { page: 1, pageSize: 10 });

// Run reads with the soft-delete filter off — the ONLY supported way to see trashed rows
const rows = await api.withSoftDeleted(() =>
  strapi.db.query('api::article.article').findMany({ where: { _softDeletedAt: { $ne: null } } }),
);
```

Notes:

- Every method throws an `ApplicationError` when `uid` is not an `api::` content type.
- `softDelete`, `restore`, and `deletePermanently` run the plugin lifecycle hooks exactly like the admin operations do — the returned promise **rejects** when a `before*` handler throws or returns `{ cancel: true }`, and when an `after*` handler throws (see [Hook Error Semantics](#hook-error-semantics)).
- Outside an HTTP request (cron, CLI, bootstrap), pass `{ auth: { id, strategy } }` as the last argument to attribute the operation; by default attribution is resolved from the current request.
- `softDelete` accepts an optional `{ locale }` for localized content types: a concrete locale soft-deletes only that locale's rows (the intercepted admin delete honors its `locale` param the same way); `'*'` or omitted soft-deletes every locale.
- Types ship with the package: `import type { SoftDeleteApi } from 'strapi-soft-delete-plugin'`.

### Worked example: cascading soft delete and restore

Soft-delete a product's variants together with the product, and bring them back on restore:

```typescript
// src/index.ts
export default {
  async bootstrap({ strapi }) {
    const hooks = strapi.plugin('soft-delete').service('lifecycle-hooks');
    const api = strapi.plugin('soft-delete').service('api');

    hooks.register('afterSoftDelete', async ({ uid, documentId }) => {
      if (uid !== 'api::product.product') return;

      const variants = await strapi.db.query('api::variant.variant').findMany({
        where: { product: { documentId } },
      });

      for (const variant of variants) {
        await api.softDelete('api::variant.variant', variant.documentId);
      }
    });

    hooks.register('afterRestore', async ({ uid, documentId }) => {
      if (uid !== 'api::product.product') return;

      // Trashed variants are invisible to normal reads — look them up with the filter off
      const variants = await api.withSoftDeleted(() =>
        strapi.db.query('api::variant.variant').findMany({
          where: { product: { documentId }, _softDeletedAt: { $ne: null } },
        }),
      );

      for (const variant of variants) {
        await api.restore('api::variant.variant', variant.documentId);
      }
    });
  },
};
```

A failure while cascading (e.g. one `api.softDelete` call rejects) propagates out of the `after*` hook and **rolls the parent operation back** — the plugin-owned transaction spans the parent write, your `after*` cascade, and the children's writes, so the whole cascade is atomic.

## How It Works

1. **Schema injection** — adds three hidden fields (`_softDeletedAt`, `_softDeletedById`, `_softDeletedByType`) to all `api::*` content types at boot time
2. **Delete interception** — Document Service middleware converts `delete` operations into updates that set the soft-delete fields
3. **Query filtering** — database lifecycle subscriber injects `_softDeletedAt IS NULL` into every query, hiding soft-deleted entries from normal API responses and populated relations
4. **Admin API** — separate endpoints for listing, restoring, and permanently deleting soft-deleted entries
5. **Component cleanup** — permanent delete properly removes associated components and dynamic zones

## Migrating from v4

See [MIGRATION.md](MIGRATION.md) for a step-by-step guide.

## Development

```bash
# Install dependencies
npm install

# Build the plugin
npm run build

# Type check (server + admin + tests)
npm run type-check

# Lint
npm run lint

# Format
npm run format

# Unit tests
npm run test

# Unit tests with coverage
npm run test:coverage

# E2E tests (requires running Strapi instance)
npm run test:e2e
```

## License

[MIT](LICENSE.md)
