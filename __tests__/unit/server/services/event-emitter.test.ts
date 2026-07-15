import { describe, it, expect, beforeEach, vi } from 'vitest';

import { createMockStrapi } from '../../../helpers/mock-strapi';
import eventEmitterFactory from '../../../../server/src/services/event-emitter';

let mock: ReturnType<typeof createMockStrapi>;

beforeEach(() => {
  mock = createMockStrapi();
  // The sanitizer resolves `api.responses.privateAttributes` through the
  // global strapi config, exactly like core's document-service events do
  (globalThis as Record<string, unknown>).strapi = mock.strapi;
  mock.strapi.config.get.mockImplementation((_key: string, defaultValue?: unknown) => defaultValue);
});

const createService = () => eventEmitterFactory({ strapi: mock.strapi as never });

const ARTICLE_MODEL = {
  uid: 'api::article.article',
  modelName: 'article',
  attributes: {
    title: { type: 'string' },
    internalNote: { type: 'string', private: true },
    secretPhrase: { type: 'password' },
    _softDeletedAt: { type: 'datetime', private: true },
    _softDeletedById: { type: 'integer', private: true },
    _softDeletedByType: { type: 'string', private: true },
  },
};

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

  it('strips private and password attributes from the emitted entry, keeping public fields', async () => {
    mock.strapi.getModel.mockReturnValue(ARTICLE_MODEL as never);
    const service = createService();

    await service.emit({
      uid: 'api::article.article',
      event: 'entry.delete',
      action: 'soft-delete',
      entity: {
        id: 1,
        documentId: 'doc-1',
        title: 'Public Title',
        internalNote: 'do not leak',
        secretPhrase: 'hunter2',
      },
    });

    expect(mock.strapi.eventHub.emit).toHaveBeenCalledWith(
      'entry.delete',
      expect.objectContaining({
        entry: { id: 1, documentId: 'doc-1', title: 'Public Title' },
      }),
    );
  });

  it('strips the soft-delete bookkeeping fields from the emitted entry (v4 parity)', async () => {
    mock.strapi.getModel.mockReturnValue(ARTICLE_MODEL as never);
    const service = createService();

    await service.emit({
      uid: 'api::article.article',
      event: 'entry.delete',
      action: 'soft-delete',
      entity: {
        id: 1,
        title: 'Trashed',
        _softDeletedAt: '2026-01-01T00:00:00.000Z',
        _softDeletedById: 7,
        _softDeletedByType: 'admin',
      },
    });

    const payload = (mock.strapi.eventHub.emit as ReturnType<typeof vi.fn>).mock.calls[0][1] as {
      entry: Record<string, unknown>;
    };
    expect(payload.entry).toEqual({ id: 1, title: 'Trashed' });
    expect(payload.entry).not.toHaveProperty('_softDeletedAt');
    expect(payload.entry).not.toHaveProperty('_softDeletedById');
    expect(payload.entry).not.toHaveProperty('_softDeletedByType');
  });

  it('does not mutate the entity passed by the caller', async () => {
    mock.strapi.getModel.mockReturnValue(ARTICLE_MODEL as never);
    const service = createService();
    const entity = { id: 1, title: 'Original', internalNote: 'kept on caller side' };

    await service.emit({
      uid: 'api::article.article',
      event: 'entry.delete',
      action: 'soft-delete',
      entity,
    });

    expect(entity).toEqual({ id: 1, title: 'Original', internalNote: 'kept on caller side' });
  });
});
