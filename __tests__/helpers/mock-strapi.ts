import { vi } from 'vitest';

interface MockQueryMethods {
  readonly findMany: ReturnType<typeof vi.fn>;
  readonly findOne: ReturnType<typeof vi.fn>;
  readonly count: ReturnType<typeof vi.fn>;
  readonly update: ReturnType<typeof vi.fn>;
  readonly updateMany: ReturnType<typeof vi.fn>;
  readonly delete: ReturnType<typeof vi.fn>;
  readonly deleteMany: ReturnType<typeof vi.fn>;
  readonly load: ReturnType<typeof vi.fn>;
}

interface MockPluginService {
  readonly [key: string]: ReturnType<typeof vi.fn> | unknown;
}

interface MockStoreInstance {
  readonly get: ReturnType<typeof vi.fn>;
  readonly set: ReturnType<typeof vi.fn>;
}

const createMockQueryMethods = (): MockQueryMethods => ({
  findMany: vi.fn().mockResolvedValue([]),
  findOne: vi.fn().mockResolvedValue(null),
  count: vi.fn().mockResolvedValue(0),
  update: vi.fn().mockResolvedValue(null),
  updateMany: vi.fn().mockResolvedValue({ count: 0 }),
  delete: vi.fn().mockResolvedValue(null),
  deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  load: vi.fn().mockResolvedValue({}),
});

const createMockStore = (): MockStoreInstance => ({
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue(undefined),
});

interface RecordedKnexUpdate {
  readonly tableName: string;
  readonly where: Record<string, unknown>;
  readonly data: Record<string, unknown>;
}

const SNAKE_CASE_COLUMNS: Readonly<Record<string, string>> = {
  documentId: 'document_id',
  _softDeletedAt: 'soft_deleted_at',
  _softDeletedById: 'soft_deleted_by_id',
  _softDeletedByType: 'soft_deleted_by_type',
};

export const createMockStrapi = () => {
  const queryMap = new Map<string, MockQueryMethods>();
  const services = new Map<string, MockPluginService>();
  const store = createMockStore();
  const knexUpdates: RecordedKnexUpdate[] = [];
  const mockTrx = { __mockTransaction: true };

  const getQueryForUid = (uid: string): MockQueryMethods => {
    if (!queryMap.has(uid)) {
      queryMap.set(uid, createMockQueryMethods());
    }
    return queryMap.get(uid)!;
  };

  // Minimal chainable knex query builder recording update() calls
  const createKnexBuilder = (tableName: string) => {
    let recordedWhere: Record<string, unknown> = {};

    const builder = {
      transacting: vi.fn(() => builder),
      where: vi.fn((column: string | Record<string, unknown>, value?: unknown) => {
        recordedWhere =
          typeof column === 'string' ? { ...recordedWhere, [column]: value } : { ...column };
        return builder;
      }),
      update: vi.fn(async (data: Record<string, unknown>) => {
        knexUpdates.push({ tableName, where: recordedWhere, data });
        return 1;
      }),
    };

    return builder;
  };

  const mockStrapi = {
    db: {
      query: vi.fn((uid: string) => getQueryForUid(uid)),
      lifecycles: {
        disable: vi.fn(),
        enable: vi.fn(),
        subscribe: vi.fn(),
      },
      metadata: {
        get: vi.fn((uid: string) => ({
          uid,
          tableName: `${uid.split('.').pop() ?? uid}s`,
          attributes: Object.fromEntries(
            Object.entries(SNAKE_CASE_COLUMNS).map(([attribute, columnName]) => [
              attribute,
              { type: 'string', columnName },
            ]),
          ),
        })),
      },
      getConnection: vi.fn((tableName: string) => createKnexBuilder(tableName)),
      transaction: vi.fn(
        async <T>(
          cb: (params: {
            trx: unknown;
            commit: () => Promise<void>;
            rollback: () => Promise<void>;
            onCommit: (fn: () => unknown) => void;
            onRollback: (fn: () => unknown) => void;
          }) => Promise<T>,
        ): Promise<T> =>
          cb({
            trx: mockTrx,
            commit: vi.fn(),
            rollback: vi.fn(),
            onCommit: vi.fn(),
            onRollback: vi.fn(),
          }),
      ),
    },

    documents: Object.assign(vi.fn(), {
      use: vi.fn(),
    }),

    contentTypes: {} as Record<string, Record<string, unknown>>,

    plugin: vi.fn((pluginId: string) => ({
      service: vi.fn((serviceName: string) => {
        const key = `${pluginId}::${serviceName}`;
        return services.get(key) ?? {};
      }),
    })),

    service: vi.fn((serviceId: string) => {
      const key = `admin::${serviceId.replace('admin::', '')}`;
      return services.get(key) ?? {};
    }),

    store: vi.fn(() => store),

    requestContext: {
      get: vi.fn().mockReturnValue({
        state: {
          auth: {
            credentials: { id: 1 },
            strategy: { name: 'admin' },
          },
        },
      }),
    },

    eventHub: {
      emit: vi.fn().mockResolvedValue(undefined),
    },

    getModel: vi.fn((uid: string) => ({
      modelName: uid.split('.').pop() ?? uid,
      uid,
      attributes: {},
    })),

    get: vi.fn((registry: string) => {
      if (registry === 'content-types') {
        return {
          extend: vi.fn(),
        };
      }
      return {};
    }),

    config: {
      get: vi.fn().mockReturnValue({}),
      environment: 'test',
    },

    cron: {
      add: vi.fn(),
    },

    log: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    },
  };

  return {
    strapi: mockStrapi,
    queryMap,
    services,
    store,
    getQueryForUid,
    knexUpdates,

    registerService: (pluginId: string, serviceName: string, service: MockPluginService) => {
      services.set(`${pluginId}::${serviceName}`, service);
    },

    registerAdminService: (serviceName: string, service: MockPluginService) => {
      services.set(`admin::${serviceName}`, service);
    },

    setContentTypes: (types: Record<string, Record<string, unknown>>) => {
      mockStrapi.contentTypes = types;
    },

    setAuthContext: (id: number | null, strategy: string) => {
      mockStrapi.requestContext.get.mockReturnValue({
        state: {
          auth: {
            credentials: { id },
            strategy: { name: strategy },
          },
        },
      });
    },
  };
};

export type MockStrapi = ReturnType<typeof createMockStrapi>;
