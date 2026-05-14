import { describe, it, expect, beforeEach } from 'vitest';

import { createMockStrapi } from '../../../helpers/mock-strapi';
import eventEmitterFactory from '../../../../server/src/services/event-emitter';

let mock: ReturnType<typeof createMockStrapi>;

beforeEach(() => {
  mock = createMockStrapi();
});

const createService = () => eventEmitterFactory({ strapi: mock.strapi as never });

describe('event-emitter service', () => {
  it('emits event with model info and plugin metadata', async () => {
    const service = createService();

    await service.emit({
      uid: 'api::article.article',
      event: 'entry.delete',
      action: 'soft-delete',
      entity: { id: 1, title: 'Test' },
    });

    expect(mock.strapi.eventHub.emit).toHaveBeenCalledWith('entry.delete', {
      model: 'article',
      uid: 'api::article.article',
      plugin: { id: 'soft-delete', action: 'soft-delete' },
      entry: { id: 1, title: 'Test' },
    });
  });

  it('does not emit when model is not found', async () => {
    mock.strapi.getModel.mockReturnValue(undefined as never);
    const service = createService();

    await service.emit({
      uid: 'api::nonexistent.nonexistent',
      event: 'entry.delete',
      action: 'soft-delete',
      entity: { id: 1 },
    });

    expect(mock.strapi.eventHub.emit).not.toHaveBeenCalled();
  });

  it('passes correct action metadata for restore', async () => {
    const service = createService();

    await service.emit({
      uid: 'api::page.page',
      event: 'entry.update',
      action: 'restore',
      entity: { id: 2 },
    });

    expect(mock.strapi.eventHub.emit).toHaveBeenCalledWith(
      'entry.update',
      expect.objectContaining({
        plugin: { id: 'soft-delete', action: 'restore' },
      }),
    );
  });
});
