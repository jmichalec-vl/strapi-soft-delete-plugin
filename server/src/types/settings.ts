export type SingleTypeRestorationBehavior = 'soft-delete' | 'delete-permanently';
export type DraftPublishRestorationBehavior = 'draft' | 'unchanged';

export interface PluginSettings {
  readonly singleTypesRestorationBehavior: SingleTypeRestorationBehavior;
  readonly draftPublishRestorationBehavior: DraftPublishRestorationBehavior;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  singleTypesRestorationBehavior: 'soft-delete',
  draftPublishRestorationBehavior: 'unchanged',
};
