import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

// Absolute path the site is served from, slashes at both ends (see CLAUDE.md "CI contract").
const base = process.env.BASE_PATH || '/';
const buildSha = process.env.BUILD_SHA || 'dev';
const buildLabel = process.env.BUILD_LABEL || 'local';

const manifest = {
  id: base,
  name: 'Phone Zombies Commute',
  short_name: 'Zombie Commute',
  description: 'A comic arcade commute: dodge the phone zombies, make your train.',
  start_url: base,
  scope: base,
  display: 'standalone',
  background_color: '#10202a',
  theme_color: '#10202a',
  categories: ['games', 'health'],
  icons: [
    { src: `${base}icons/icon-192.png`, sizes: '192x192', type: 'image/png' },
    { src: `${base}icons/icon-512.png`, sizes: '512x512', type: 'image/png' },
    { src: `${base}icons/icon-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

/** Emits the web app manifest and a service worker that precaches every file in the build. */
function pwa(): Plugin {
  let outDir = 'dist';
  return {
    name: 'pzc-pwa',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    configureServer(server) {
      server.middlewares.use(`${base}manifest.webmanifest`.replace(/\/+/g, '/'), (_req, res) => {
        res.setHeader('Content-Type', 'application/manifest+json');
        res.end(JSON.stringify(manifest));
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: JSON.stringify(manifest, null, 2) });
    },
    closeBundle() {
      const files = listFiles(outDir)
        .map((f) => relative(outDir, f).split(sep).join('/'))
        .filter((f) => f !== 'sw.js' && !f.endsWith('.map'))
        .sort();
      const hash = createHash('sha256');
      for (const f of files) hash.update(f).update(readFileSync(join(outDir, f)));
      const version = hash.digest('hex').slice(0, 12);
      const template = readFileSync('sw/sw.template.js', 'utf8');
      const urls = ['./', ...files.filter((f) => f !== 'index.html')];
      writeFileSync(
        join(outDir, 'sw.js'),
        template.replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify(urls)),
      );
    },
  };
}

export default defineConfig({
  base,
  plugins: [pwa()],
  define: {
    __BUILD_SHA__: JSON.stringify(buildSha.slice(0, 7)),
    __BUILD_LABEL__: JSON.stringify(buildLabel),
  },
  build: { target: 'es2022', sourcemap: false },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
