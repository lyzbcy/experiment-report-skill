// Node 18+ transactional updater. No npm, Git or shell extraction required.
// Keep .update/ in place so a killed process can recover on the next invocation.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { inflateRawSync } = require('node:zlib');
const REQUIRED = ['SKILL.md', 'README.md', 'VERSION', '.update/updater.cjs',
  '.update/silent-update.sh', 'references/checklist.md', 'references/math-formulas.md',
  'references/templates/report_template.md', 'references/templates/report_template_docx.js'];
const LIMIT = 16 * 1024 * 1024;
const REPO = 'lyzbcy/experiment-report-skill';
function version(value) {
  if (!/^\d+\.\d+\.\d+$/.test(value.trim())) throw new Error('Invalid release version');
  const parts = value.trim().split('.').map(Number);
  if (parts.some(n => !Number.isSafeInteger(n))) throw new Error('Invalid release version');
  return parts;
}
function newer(a, b) {
  const aa = version(a), bb = version(b);
  for (let i = 0; i < 3; i++) if (aa[i] !== bb[i]) return aa[i] > bb[i];
  return false;
}
function safeName(name) {
  if (!name || name.includes('\\') || name.includes(':') || name.includes('\0') || name.startsWith('/') ||
      name.split('/').some(p => !p || p === '.' || p === '..' || /[. ]$/.test(p) ||
        /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) throw new Error('Unsafe package path');
  if (name.split('/').some(p => p.toLowerCase() === '.git') ||
      (name.startsWith('.update/') && !['.update/updater.cjs', '.update/silent-update.sh'].includes(name))) throw new Error('Reserved package path');
  return name;
}
function within(root, name) {
  const target = path.resolve(root, safeName(name));
  if (!target.startsWith(path.resolve(root) + path.sep)) throw new Error('Path escaped install');
  let current = path.resolve(root);
  for (const part of name.split('/')) {
    current = path.join(current, part);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error('Symlink in install path');
  }
  return target;
}
function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function unpackZip(buf) {
  if (buf.length > LIMIT || buf.length < 22) throw new Error('Invalid archive size');
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50 && i + 22 + buf.readUInt16LE(i + 20) === buf.length) { end = i; break; }
  }
  if (end < 0 || buf.readUInt32LE(end + 4) !== 0 || buf.readUInt16LE(end + 8) !== buf.readUInt16LE(end + 10)) throw new Error('Unsupported ZIP');
  const count = buf.readUInt16LE(end + 10), directory = buf.readUInt32LE(end + 16);
  let cursor = directory;
  if (!count || count > 2000 || directory + buf.readUInt32LE(end + 12) !== end) throw new Error('Invalid ZIP directory');
  const files = new Map(), seen = new Set();
  let prefix, total = 0;
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || buf.readUInt32LE(cursor) !== 0x02014b50) throw new Error('Invalid ZIP entry');
    const flags = buf.readUInt16LE(cursor + 8), method = buf.readUInt16LE(cursor + 10);
    const crc = buf.readUInt32LE(cursor + 16), compressed = buf.readUInt32LE(cursor + 20), size = buf.readUInt32LE(cursor + 24);
    const nameLen = buf.readUInt16LE(cursor + 28), extraLen = buf.readUInt16LE(cursor + 30), commentLen = buf.readUInt16LE(cursor + 32);
    const attrs = buf.readUInt32LE(cursor + 38), offset = buf.readUInt32LE(cursor + 42);
    const next = cursor + 46 + nameLen + extraLen + commentLen;
    if (next > end || flags & 1 || ![0, 8].includes(method) || (attrs >>> 16 & 0xf000) === 0xa000) throw new Error('Unsupported ZIP entry');
    const archiveName = buf.subarray(cursor + 46, cursor + 46 + nameLen).toString('utf8');
    const isDir = archiveName.endsWith('/'), clean = isDir ? archiveName.slice(0, -1) : archiveName;
    if (!clean || clean.includes('\\') || clean.includes(':') || clean.includes('\0') || clean.startsWith('/') ||
        clean.split('/').some(p => !p || p === '.' || p === '..')) throw new Error('Unsafe ZIP path');
    const [top, ...parts] = clean.split('/');
    if (!prefix) prefix = top;
    if (top !== prefix) throw new Error('Multiple archive roots');
    const name = parts.join('/');
    if (!name && !isDir) throw new Error('Invalid archive root');
    if (name) {
      // Directory records such as .update/ are structural, not runtime files.
      if (isDir) { if (name !== '.update') safeName(name); }
      else safeName(name);
      const key = name.toLowerCase();
      if (seen.has(key)) throw new Error('Duplicate package path');
      seen.add(key);
    }
    if (offset + 30 > directory || buf.readUInt32LE(offset) !== 0x04034b50) throw new Error('Invalid ZIP local header');
    const localNameLen = buf.readUInt16LE(offset + 26), localExtraLen = buf.readUInt16LE(offset + 28);
    const start = offset + 30 + localNameLen + localExtraLen;
    if (start + compressed > directory ||
        buf.subarray(offset + 30, offset + 30 + localNameLen).toString('utf8') !== archiveName ||
        buf.readUInt16LE(offset + 8) !== method || buf.readUInt16LE(offset + 6) !== flags) throw new Error('ZIP header mismatch');
    total += size;
    if (size > LIMIT || total > LIMIT) throw new Error('Expanded archive too large');
    const bytes = buf.subarray(start, start + compressed);
    const data = method === 8 ? inflateRawSync(bytes, { maxOutputLength: LIMIT }) : Buffer.from(bytes);
    if (data.length !== size || crc32(data) !== crc) throw new Error('Corrupt ZIP data');
    if (name && !isDir) files.set(name, data);
    cursor = next;
  }
  if (cursor !== end) throw new Error('Invalid ZIP directory length');
  return files;
}
function validatePackage(files, expected) {
  for (const name of files.keys()) safeName(name);
  for (const name of REQUIRED) if (!files.has(name) || !files.get(name).length) throw new Error(`Missing ${name}`);
  const actual = files.get('VERSION').toString('utf8').trim();
  version(actual);
  if (actual !== expected.trim()) throw new Error('Release version mismatch');
  if (!/^---\r?\n[\s\S]*?name: experiment-report-skill\r?\n/.test(files.get('SKILL.md').toString('utf8'))) throw new Error('Invalid skill entrypoint');
}
function atomicWrite(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = path.join(path.dirname(file), `.${path.basename(file)}.${crypto.randomUUID()}.tmp`);
  try {
    const fd = fs.openSync(temp, 'wx');
    try { fs.writeFileSync(fd, data); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(temp, file);
  } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function writeJson(file, data) { atomicWrite(file, JSON.stringify(data)); }
function stateDir(root) {
  const state = path.join(root, '.update');
  if (fs.lstatSync(root).isSymbolicLink() || (fs.existsSync(state) && fs.lstatSync(state).isSymbolicLink())) throw new Error('Symlink install root');
  fs.mkdirSync(state, { recursive: true });
  return state;
}
function backupDir(state, id) {
  if (!/^backup-[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid backup id');
  const target = path.resolve(state, id);
  if (!target.startsWith(path.resolve(state) + path.sep) || (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink())) throw new Error('Unsafe backup directory');
  return target;
}
function restore(root, transaction) {
  const state = stateDir(root), backup = backupDir(state, transaction.id);
  // Verify all backup checksums before writing any restored files.
  const saved = transaction.entries.map(entry => {
    const target = within(root, entry.name);
    if (!entry.existed) return { ...entry, target };
    const data = fs.readFileSync(within(backup, entry.name));
    if (crypto.createHash('sha256').update(data).digest('hex') !== entry.sha256) throw new Error('Backup checksum mismatch');
    return { ...entry, target, data };
  });
  for (const entry of saved) {
    if (entry.existed) atomicWrite(entry.target, entry.data);
    else if (fs.existsSync(entry.target)) fs.unlinkSync(entry.target);
  }
  const managedPath = path.join(state, 'managed-files.json');
  if (transaction.managed === null) { if (fs.existsSync(managedPath)) fs.unlinkSync(managedPath); }
  else writeJson(managedPath, transaction.managed);
  const previousPath = path.join(state, 'previous.json');
  if (transaction.previous === null) { if (fs.existsSync(previousPath)) fs.unlinkSync(previousPath); }
  else writeJson(previousPath, transaction.previous);
}
function recover(root) {
  const state = stateDir(root), journal = path.join(state, 'journal.json');
  if (!fs.existsSync(journal)) return false;
  const transaction = readJson(journal);
  try { restore(root, transaction); }
  catch (error) { throw new Error(`Rollback incomplete: ${error.message}`, { cause: error }); }
  fs.unlinkSync(journal);
  fs.rmSync(backupDir(state, transaction.id), { recursive: true });
  return true;
}
function rank(name) { return name === '.update/updater.cjs' ? 3 : name === '.update/silent-update.sh' ? 2 : name === 'VERSION' ? 1 : 0; }
function install(root, files, expected, { hook = () => {} } = {}) {
  validatePackage(files, expected);
  const state = stateDir(root), managedPath = path.join(state, 'managed-files.json'), previousPath = path.join(state, 'previous.json');
  const managed = fs.existsSync(managedPath) ? readJson(managedPath) : null;
  const previous = fs.existsSync(previousPath) ? readJson(previousPath) : null;
  const names = [...new Set([...(managed || REQUIRED.filter(n => fs.existsSync(within(root, n)))), ...files.keys()])];
  names.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  const id = `backup-${crypto.randomUUID()}`, backup = backupDir(state, id);
  fs.mkdirSync(backup);
  const transaction = { id, managed, previous, entries: [] };
  let journalWritten = false;
  try {
    for (const name of names) {
      const target = within(root, name), existed = fs.existsSync(target);
      if (existed && !fs.lstatSync(target).isFile()) throw new Error('Install target is not a file');
      const entry = { name, existed };
      if (existed) {
        const data = fs.readFileSync(target);
        entry.sha256 = crypto.createHash('sha256').update(data).digest('hex');
        atomicWrite(within(backup, name), data);
      }
      transaction.entries.push(entry);
    }
    writeJson(path.join(state, 'journal.json'), transaction);
    journalWritten = true;
    hook('backed-up');
    for (const name of names) {
      const target = within(root, name);
      if (files.has(name)) atomicWrite(target, files.get(name));
      else if (fs.existsSync(target)) fs.unlinkSync(target);
      hook('replaced', name);
    }
    writeJson(managedPath, [...files.keys()]);
    validatePackage(new Map([...files.keys()].map(name => [name, fs.readFileSync(within(root, name))])), expected);
    hook('verified');
    writeJson(previousPath, { ...transaction, previous: null });
    fs.unlinkSync(path.join(state, 'journal.json'));
    journalWritten = false;
    // Keep the previous release until the next successful update.
    if (previous) { try { fs.rmSync(backupDir(state, previous.id), { recursive: true }); } catch {} }
  } catch (error) {
    if (journalWritten) {
      try { recover(root); } catch (recoveryError) { throw recoveryError; }
    } else { try { fs.rmSync(backupDir(state, id), { recursive: true }); } catch {} }
    throw error;
  }
}
function rollback(root) {
  const state = stateDir(root), previousPath = path.join(state, 'previous.json');
  if (recover(root)) return fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim();
  if (!fs.existsSync(previousPath)) throw new Error('No previous release backup');
  const transaction = readJson(previousPath);
  // Old backups older than one release have been pruned; do not resurrect pointers.
  transaction.previous = null;
  writeJson(path.join(state, 'journal.json'), transaction);
  recover(root);
  atomicWrite(path.join(state, 'last_check'), new Date().toISOString().slice(0, 10));
  return fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim();
}
function acquireLock(root) {
  const lock = path.join(stateDir(root), 'lock.json');
  try {
    if (fs.existsSync(lock)) {
      let pid;
      try { pid = readJson(lock).pid; }
      catch {
        // A process killed while first writing the lock may leave truncated JSON.
        // Allow a short grace period so an active writer is never interrupted.
        if (Date.now() - fs.statSync(lock).mtimeMs < 120000) return null;
        fs.unlinkSync(lock);
      }
      if (pid === undefined && !fs.existsSync(lock)) {
        fs.writeFileSync(lock, JSON.stringify({ pid: process.pid }), { flag: 'wx' });
        return () => fs.unlinkSync(lock);
      }
      if (!Number.isInteger(pid) || pid < 1) return null;
      try { process.kill(pid, 0); return null; } catch (e) { if (e.code !== 'ESRCH') return null; }
      fs.unlinkSync(lock);
    }
    fs.writeFileSync(lock, JSON.stringify({ pid: process.pid }), { flag: 'wx' });
    return () => fs.unlinkSync(lock);
  } catch { return null; }
}
async function download(url, fetchImpl = fetch) {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'experiment-report-skill-updater' } });
  if (!response.ok) throw new Error(`Download HTTP ${response.status}`);
  const chunks = []; let length = 0;
  for await (const chunk of response.body) {
    length += chunk.length;
    if (length > LIMIT) throw new Error('Download too large');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
async function runUpdate(root, { fetchImpl = fetch, force = false } = {}) {
  if (fs.existsSync(path.join(root, '.git'))) return { status: 'checkout' };
  const release = acquireLock(root);
  if (!release) return { status: 'busy' };
  try {
    if (recover(root)) return { status: 'recovered' };
    const state = stateDir(root), today = new Date().toISOString().slice(0, 10), stamp = path.join(state, 'last_check');
    if (!force && fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8').trim() === today) return { status: 'checked' };
    atomicWrite(stamp, today);
    const local = fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim();
    version(local);
    // Pin VERSION and archive to the SAME immutable commit.
    const ref = JSON.parse((await download(`https://api.github.com/repos/${REPO}/git/ref/heads/master`, fetchImpl)).toString('utf8'));
    const sha = ref.object?.sha;
    if (!/^[a-f0-9]{40}$/.test(sha || '')) throw new Error('Invalid release commit');
    let remote;
    try { remote = (await download(`https://raw.githubusercontent.com/${REPO}/${sha}/VERSION`, fetchImpl)).toString('utf8').trim(); }
    catch { remote = (await download(`https://cdn.jsdelivr.net/gh/${REPO}@${sha}/VERSION`, fetchImpl)).toString('utf8').trim(); }
    if (!newer(remote, local)) return { status: 'current' };
    install(root, unpackZip(await download(`https://codeload.github.com/${REPO}/zip/${sha}`, fetchImpl)), remote);
    return { status: 'updated', version: remote };
  } finally { release(); }
}
module.exports = { version, newer, safeName, unpackZip, validatePackage, install, recover, rollback, runUpdate, crc32, REQUIRED };
if (require.main === module) {
  const root = path.resolve(__dirname, '..');
  (async () => {
    if (process.argv.includes('--rollback')) {
      if (fs.existsSync(path.join(root, '.git'))) throw new Error('Rollback is for installed skills, not Git checkouts');
      const release = acquireLock(root);
      if (!release) throw new Error('Updater is busy');
      try { console.log(`ROLLED BACK ${rollback(root)}`); } finally { release(); }
    } else {
      const result = await runUpdate(root, { force: process.argv.includes('--force') });
      if (result.status === 'updated') console.log(`UPDATED ${result.version}`);
    }
  })().catch(error => {
    if (process.argv.includes('--rollback') || error.message.startsWith('Rollback incomplete:')) { console.error(error.message); process.exitCode = 1; }
    // Ordinary download/validation failures leave the installed skill and stay quiet.
  });
}
