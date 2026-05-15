# Strapi v5 — Soft Delete Plugin

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

| Strapi Version | Plugin Version |
|----------------|----------------|
| ^5.0.0         | 1.x            |
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
        ttlDays: 30,        // permanently delete after 30 days
        cron: '0 2 * * *',  // run daily at 2 AM
      },
    },
  },
});
```

## RBAC Permissions

Configure per-role in **Settings → Roles → [Role Name]**:

| Section | Permission | Description |
|---------|-----------|-------------|
| Collection & Single Types | `Soft Delete` | Soft delete entries (replaces "Delete") |
| Collection & Single Types | `Deleted Read` | View soft-deleted entries in the explorer |
| Collection & Single Types | `Deleted Restore` | Restore soft-deleted entries |
| Collection & Single Types | `Delete Permanently` | Permanently remove soft-deleted entries |
| Plugins → Soft Delete | `Read` | Access the Soft Delete explorer in the sidebar |
| Plugins → Soft Delete | `Settings` | Manage plugin settings |

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
      // Return { cancel: true } to prevent the operation
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

All `before*` hooks can return `{ cancel: true }` to abort the operation.

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
