import { PLUGIN_ID } from '../constants/plugin';

export const getTranslation = (id: string): string => `${PLUGIN_ID}.${id}`;
