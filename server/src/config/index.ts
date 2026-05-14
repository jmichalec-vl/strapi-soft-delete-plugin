export interface PluginConfig {
  readonly autoPurge?: {
    readonly enabled?: boolean;
    readonly ttlDays?: number;
    readonly cron?: string;
  };
}

const defaultConfig: PluginConfig = {
  autoPurge: {
    enabled: false,
    ttlDays: 30,
    cron: '0 2 * * *',
  },
};

const validator = (config: PluginConfig): void => {
  if (!config.autoPurge) return;

  const { ttlDays, cron } = config.autoPurge;

  if (ttlDays !== undefined && (typeof ttlDays !== 'number' || ttlDays < 1)) {
    throw new Error('[soft-delete] autoPurge.ttlDays must be a positive number.');
  }

  if (cron !== undefined && typeof cron !== 'string') {
    throw new Error('[soft-delete] autoPurge.cron must be a valid cron expression string.');
  }
};

export default {
  default: defaultConfig,
  validator,
};
