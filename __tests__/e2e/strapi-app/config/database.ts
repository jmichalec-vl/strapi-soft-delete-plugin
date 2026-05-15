import path from 'node:path';

// __dirname is config/ in develop, dist/config/ in production
// In both cases we want .tmp/data.db relative to the strapi-app root
const depth = __dirname.includes(path.join('dist', 'config')) ? 2 : 1;
const steps = Array.from({ length: depth }, () => '..');

export default ({ env }) => ({
  connection: {
    client: 'sqlite',
    connection: {
      filename: path.join(__dirname, ...steps, env('DATABASE_FILENAME', '.tmp/data.db')),
    },
    useNullAsDefault: true,
  },
});
