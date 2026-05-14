import path from 'node:path';

const depth = __dirname.includes(path.join('dist', 'config')) ? 5 : 4;
const steps = Array.from({ length: depth }, () => '..');
const pluginRoot = path.resolve(__dirname, ...steps);

export default () => ({
  'soft-delete': {
    enabled: true,
    resolve: pluginRoot,
  },
});
