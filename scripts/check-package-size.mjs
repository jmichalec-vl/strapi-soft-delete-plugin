import { execSync } from 'node:child_process';

// The plugin publishes at ~70 kB tarball / ~310 kB unpacked. Both 0.1.0 and
// 0.2.0 accidentally shipped a vendored @strapi/utils graph (2+ MB), which
// only externalization in package.json prevents — these ceilings catch any
// dependency that silently slips into the bundle before it reaches npm.
const MAX_TARBALL_KB = 150;
const MAX_UNPACKED_KB = 600;
const LARGEST_FILES_SHOWN = 5;

const toKb = (bytes) => bytes / 1024;
const formatKb = (bytes) => `${toKb(bytes).toFixed(1)} kB`;

const [report] = JSON.parse(
  execSync('npm pack --dry-run --json', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }),
);

const packsServerBundle = report.files.some((file) => file.path.startsWith('dist/server/'));
if (!packsServerBundle) {
  console.error('[size-check] No dist/server files in the package — run `npm run build` first.');
  process.exit(1);
}

const failures = [];
if (toKb(report.size) > MAX_TARBALL_KB) {
  failures.push(`tarball ${formatKb(report.size)} exceeds ${MAX_TARBALL_KB} kB`);
}
if (toKb(report.unpackedSize) > MAX_UNPACKED_KB) {
  failures.push(`unpacked ${formatKb(report.unpackedSize)} exceeds ${MAX_UNPACKED_KB} kB`);
}

if (failures.length > 0) {
  console.error(`[size-check] FAILED: ${failures.join('; ')}`);
  console.error(
    '[size-check] A dependency is probably being bundled instead of externalized —',
    'runtime imports must be declared in dependencies or peerDependencies.',
  );
  console.error('[size-check] Largest packed files:');
  for (const file of [...report.files]
    .sort((a, b) => b.size - a.size)
    .slice(0, LARGEST_FILES_SHOWN)) {
    console.error(`  ${formatKb(file.size).padStart(10)}  ${file.path}`);
  }
  process.exit(1);
}

console.log(
  `[size-check] OK: tarball ${formatKb(report.size)} (max ${MAX_TARBALL_KB} kB),`,
  `unpacked ${formatKb(report.unpackedSize)} (max ${MAX_UNPACKED_KB} kB)`,
);
