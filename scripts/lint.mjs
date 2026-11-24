// Lint leve, sem dependências externas:
//  - `node --check` em todos os arquivos JS/MJS do projeto;
//  - valida JSON de manifest/package;
//  - garante que os arquivos referenciados pelo manifest existem.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname, relative, dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const IGNORED_DIRS = new Set(['node_modules', '.git']);
const errors = [];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (IGNORED_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = walk(ROOT);
const jsFiles = files.filter((f) => ['.js', '.mjs'].includes(extname(f)));

function exists(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

const LOCAL_IMPORT_PATTERNS = [
  /\bfrom\s+['"](\.[^'"]+)['"]/g,
  /\bimport\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g,
  /\bimport\s+['"](\.[^'"]+)['"]/g
];

for (const file of jsFiles) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    errors.push(`${relative(ROOT, file)}: ${(result.stderr || '').trim()}`);
    continue;
  }

  const source = readFileSync(file, 'utf8');
  for (const pattern of LOCAL_IMPORT_PATTERNS) {
    for (const match of source.matchAll(pattern)) {
      const target = resolve(dirname(file), match[1]);
      if (!exists(target)) {
        errors.push(`${relative(ROOT, file)}: import não resolvido → ${match[1]}`);
      }
    }
  }
}

const htmlFiles = files.filter((f) => extname(f) === '.html');
for (const file of htmlFiles) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const ref = match[1];
    if (/^(https?:|#|data:)/.test(ref)) continue;
    if (!exists(resolve(dirname(file), ref))) {
      errors.push(`${relative(ROOT, file)}: recurso não encontrado → ${ref}`);
    }
  }
}

function readJson(name) {
  try {
    return JSON.parse(readFileSync(join(ROOT, name), 'utf8'));
  } catch (err) {
    errors.push(`${name}: JSON inválido (${err.message})`);
    return null;
  }
}

const manifest = readJson('manifest.json');
readJson('package.json');

if (manifest) {
  const referenced = new Set([
    manifest.background && manifest.background.service_worker,
    manifest.action && manifest.action.default_popup,
    manifest.chrome_url_overrides && manifest.chrome_url_overrides.newtab
  ]);
  Object.values((manifest.action && manifest.action.default_icon) || {}).forEach((p) => referenced.add(p));
  Object.values(manifest.icons || {}).forEach((p) => referenced.add(p));

  for (const path of referenced) {
    if (!path) continue;
    try {
      statSync(join(ROOT, path));
    } catch {
      errors.push(`manifest.json referencia arquivo inexistente: ${path}`);
    }
  }

  if (!manifest.oauth2 || !manifest.oauth2.client_id) {
    errors.push('manifest.json: bloco oauth2.client_id ausente.');
  }
  if (manifest.manifest_version !== 3) {
    errors.push('manifest.json: esperado manifest_version 3.');
  }
}

if (errors.length > 0) {
  console.error(`Lint falhou (${errors.length} problema(s)):\n`);
  errors.forEach((e) => console.error(`  ✖ ${e}`));
  process.exit(1);
}

console.log(`✓ Lint OK — ${jsFiles.length} arquivo(s) JS sem erros de sintaxe.`);
