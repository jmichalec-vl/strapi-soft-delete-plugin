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

export const createMockStrapi = () => {
  const queryMap = new Map<string, MockQueryMethods>();
  const services = new Map<string, MockPluginService>();
  const store = createMockStore();

  const getQueryForUid = (uid: string): MockQueryMethods => {
    if (!queryMap.has(uid)) {
      queryMap.set(uid, createMockQueryMethods());
    }
    return queryMap.get(uid)!;
  };

  const mockStrapi = {
    db: {
      query: vi.fn((uid: string) => getQueryForUid(uid)),
      lifecycles: {
        disable: vi.fn(),
        enable: vi.fn(),
        subscribe: vi.fn(),
      },
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
    },
  };

  return {
    strapi: mockStrapi,
    queryMap,
    services,
    store,
    getQueryForUid,

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
