import { mergeConfig } from 'vite';

export default (config: Record<string, unknown>) =>
  mergeConfig(config, {
    resolve: {
      dedupe: [
        'react',
        'react-dom',
        'react-query',
        'react-router-dom',
        'react-intl',
        'styled-components',
      ],
    },
  });
