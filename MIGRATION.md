# Migration Guide: strapi-plugin-soft-delete (v4) → strapi-soft-delete-plugin (v5)

This guide covers migrating from the original `strapi-plugin-soft-delete` (Strapi v4) to `strapi-soft-delete-plugin` (Strapi v5).

## Prerequisites

- Strapi v5 project (already migrated from v4)
- Node.js >= 20

## Step 1: Uninstall the old plugin

```bash
npm uninstall strapi-plugin-soft-delete
# or
yarn remove strapi-plugin-soft-delete
```

## Step 2: Install the new plugin

```bash
npm install strapi-soft-delete-plugin
# or
yarn add strapi-soft-delete-plugin
```

## Step 3: Update plugin configuration

The plugin config key stays the same (`soft-delete`):

```typescript
// config/plugins.ts
export default () => ({
  'soft-delete': {
    enabled: true,
  },
});
```

No changes needed if you already had this configuration.

## Step 4: Rebuild and start

```bash
npm run build
npm run develop
```

## Database Compatibility

**No database migration is needed.** This plugin uses the same column names as the v4 plugin:

- `_softDeletedAt` (datetime)
- `_softDeletedById` (integer)
- `_softDeletedByType` (string)

Existing soft-deleted records in your database will be recognized automatically.

## Settings Migration

Plugin settings are stored in the same format and location (`strapi_core_store_settings` table). Your existing settings for:

- `singleTypesRestorationBehavior` (`soft-delete` | `delete-permanently`)
- `draftPublishRestorationBehavior` (`draft` | `unchanged`)

...will be picked up automatically on first boot. No manual action needed.

## Breaking Changes from v4

### API Endpoints

Admin API endpoints now use `documentId` (string) instead of numeric `id`:

| v4                                     | v5                                      |
| -------------------------------------- | --------------------------------------- |
| `GET /:kind/:uid/:id`                  | `GET /:kind/:uid/:documentId`           |
| `DELETE /:kind/:uid/:id/delete`        | `DELETE /:kind/:uid/:documentId`        |
| `PUT /:kind/:uid/:id/restore`          | `PUT /:kind/:uid/:documentId/restore`   |
| `PUT /:kind/:uid/delete` (batch, PUT)  | `POST /:kind/:uid/batch-delete` (POST)  |
| `PUT /:kind/:uid/restore` (batch, PUT) | `POST /:kind/:uid/batch-restore` (POST) |

### Lifecycle Hooks

**Key improvement over v4:** Soft-delete and restore operations no longer trigger Strapi's core `beforeUpdate`/`afterUpdate` lifecycle hooks. In v4, this was a known caveat that required workarounds like:

```typescript
// v4 workaround — NO LONGER NEEDED
async beforeUpdate(event) {
  if (isSoftDelete(event)) return;
  // ...
}
```

In v5, you can remove these checks. Soft-delete operations are completely invisible to your existing lifecycle hooks.

### Custom Lifecycle Hooks (New)

The plugin now provides its own lifecycle hooks:

```typescript
// In your plugin or application bootstrap
strapi
  .plugin('soft-delete')
  .service('lifecycle-hooks')
  .register('beforeSoftDelete', async (payload) => {
    // payload: { uid, documentId, entries, auth }
    // Return { cancel: true } to prevent the soft-delete
  });

strapi
  .plugin('soft-delete')
  .service('lifecycle-hooks')
  .register('afterSoftDelete', async (payload) => {
    // Runs after soft-delete completes
  });

strapi
  .plugin('soft-delete')
  .service('lifecycle-hooks')
  .register('beforeRestore', async (payload) => {
    // Return { cancel: true } to prevent the restore
  });

strapi
  .plugin('soft-delete')
  .service('lifecycle-hooks')
  .register('afterRestore', async (payload) => {
    // Runs after restore completes
  });

strapi
  .plugin('soft-delete')
  .service('lifecycle-hooks')
  .register('beforeDeletePermanently', async (payload) => {
    // Return { cancel: true } to prevent permanent deletion
  });

strapi
  .plugin('soft-delete')
  .service('lifecycle-hooks')
  .register('afterDeletePermanently', async (payload) => {
    // Runs after permanent deletion
  });
```

### RBAC Permissions

Permission UIDs have changed to avoid collision with Content Manager:

| v4                                                | v5                                                            |
| ------------------------------------------------- | ------------------------------------------------------------- |
| `plugin::soft-delete.explorer.read`               | `plugin::soft-delete.explorer.soft-deleted-read`              |
| `plugin::soft-delete.explorer.restore`            | `plugin::soft-delete.explorer.restore` (unchanged)            |
| `plugin::soft-delete.explorer.delete-permanently` | `plugin::soft-delete.explorer.delete-permanently` (unchanged) |

**Since 0.2.0 this is migrated automatically:** on first boot the plugin rewrites existing `admin::permission` rows from `plugin::soft-delete.explorer.read` to `plugin::soft-delete.explorer.soft-deleted-read`, so every role keeps its trash access — no manual re-granting needed. The migration is idempotent and runs once (guarded by the plugin store's migration version). The other v4 action names (`read`, `settings`, `explorer.restore`, `explorer.delete-permanently`) are unchanged and need no migration.

## New Features in v5

- **Pagination** in the soft-delete explorer
- **Date range filters** for soft-deleted entries
- **Entry detail drawer** — click a row to preview all fields
- **Auto-purge** — automatically permanently delete entries older than N days
- **Component cleanup** — permanent delete properly cleans up components and dynamic zones
- **Populated relation filtering** — soft-deleted entries are excluded from populated relations
- **Custom lifecycle hooks** — `beforeSoftDelete`, `afterSoftDelete`, `beforeRestore`, `afterRestore`, `beforeDeletePermanently`, `afterDeletePermanently`

## Upgrading from 0.1.x to 0.2.0

### Lifecycle hook errors now propagate (behavioral change)

In 0.1.x, exceptions thrown by lifecycle hook handlers were caught and logged, and `{ cancel: true }` made the operation silently report success (a delete request returned `{ documentId, entries: [] }`). Since 0.2.0:

- An exception thrown by a `before*` handler aborts the operation and propagates to the caller. In the admin, an `errors.ApplicationError('...')` from `@strapi/utils` surfaces as an HTTP 400 with your message.
- `{ cancel: true }` is no longer silent — the operation fails with a `PolicyError` (`"Operation cancelled by <hookName> hook"`, HTTP 403). Return `{ cancel: true, error: myError }` to fail with a custom error instead.
- An exception thrown by an `after*` handler also propagates. For soft-delete and restore the operation is **rolled back** — the write and the `after*` hooks run inside a plugin-owned transaction, making host cascades atomic. For permanent delete the rows are already gone when `afterDeletePermanently` runs; the error surfaces but nothing is restored.
- A failing handler stops the handler chain — later handlers for the same hook do not run.

If you relied on hooks failing silently (e.g. best-effort logging or notifications), wrap your handler body in `try/catch`.

### Internal writes no longer disable lifecycles globally

0.1.x wrapped its internal soft-delete/restore updates in `strapi.db.lifecycles.disable()/enable()` — a process-global switch that could silently skip a concurrent request's DB lifecycles (validations, timestamps, ...). 0.2.0 performs these writes as raw, statement-scoped SQL updates instead: your lifecycles still never fire for the plugin's internal writes, and other requests are no longer affected.

### RBAC permission rows are migrated on first boot

0.1.x recognized only the new `plugin::soft-delete.explorer.soft-deleted-read` action, silently dropping trash access for roles that still carried the v4 `plugin::soft-delete.explorer.read` rows. 0.2.0 rewrites those rows automatically on its first boot (see [RBAC Permissions](#rbac-permissions) above). No manual action needed.
