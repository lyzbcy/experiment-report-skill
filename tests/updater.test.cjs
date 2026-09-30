const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { deflateRawSync } = require('node:zlib');
const updater = require('../.update/updater.cjs');
const updaterPath = require.resolve('../.update/updater.cjs');

function workspace(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'experiment-updater-test-'));
  t.after(() => {
    const resolved = fs.realpathSync(root);
    assert.ok(resolved.startsWith(fs.realpathSync(os.tmpdir()) + path.sep));
    assert.ok(path.basename(resolved).startsWith('experiment-updater-test-'));
    fs.rmSync(resolved, { recursive: true });
  });
  return root;
}
function payload(v = '1.0.1') {
  const files = new Map(updater.REQUIRED.map(n => [n, Buffer.from(`release ${v} file ${n}`)]));
  files.set('VERSION', Buffer.from(v + '\n'));
  files.set('SKILL.md', Buffer.from('---\nname: experiment-report-skill\ndescription: test fixture\n---\n' + v));
  return files;
}
function seed(root, v = '1.0.0') {
  for (const [name, data] of payload(v)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), data);
  }
  fs.writeFileSync(path.join(root, 'user-notes.txt'), 'keep local notes');
}
function expectVersion(root, v) {
  for (const [name, data] of payload(v)) assert.deepEqual(fs.readFileSync(path.join(root, name)), data, name);
  assert.equal(fs.readFileSync(path.join(root, 'user-notes.txt'), 'utf8'), 'keep local notes');
}
function zip(entries) {
  const local = [], central = []; let offset = 0;
  for (const [name, data, symlink = false] of entries) {
    const text = Buffer.from(name), input = Buffer.from(data), compressed = deflateRawSync(input);
    const l = Buffer.alloc(30), c = Buffer.alloc(46);
    l.writeUInt32LE(0x04034b50); l.writeUInt16LE(20, 4); l.writeUInt16LE(8, 8);
    l.writeUInt32LE(updater.crc32(input), 14); l.writeUInt32LE(compressed.length, 18); l.writeUInt32LE(input.length, 22); l.writeUInt16LE(text.length, 26);
    c.writeUInt32LE(0x02014b50); c.writeUInt16LE(0x0314, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(8, 10);
    c.writeUInt32LE(updater.crc32(input), 16); c.writeUInt32LE(compressed.length, 20); c.writeUInt32LE(input.length, 24); c.writeUInt16LE(text.length, 28);
    c.writeUInt32LE(symlink ? 0xa1ff0000 : 0x81a40000, 38); c.writeUInt32LE(offset, 42);
    local.push(l, text, compressed); central.push(c, text); offset += l.length + text.length + compressed.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}

test('successful install keeps local notes and rollback restores the complete old release', t => {
  const root = workspace(t); seed(root);
  const files = payload(); files.set('scripts/new.cjs', Buffer.from('new file'));
  updater.install(root, files, '1.0.1'); expectVersion(root, '1.0.1');
  assert.equal(updater.rollback(root), '1.0.0'); expectVersion(root, '1.0.0');
  assert.equal(fs.existsSync(path.join(root, 'scripts/new.cjs')), false);
  assert.throws(() => updater.rollback(root), /No previous/);
});
for (const phase of ['backed-up', 'replaced', 'verified']) {
  test(`failure at ${phase} restores every old file and removes new files`, t => {
    const root = workspace(t); seed(root);
    const files = payload(); files.set('aaa-new.txt', Buffer.from('new'));
    assert.throws(() => updater.install(root, files, '1.0.1', { hook(p) { if (p === phase) throw new Error('simulated I/O failure'); } }), /simulated/);
    expectVersion(root, '1.0.0');
    assert.equal(fs.existsSync(path.join(root, 'aaa-new.txt')), false);
    assert.equal(fs.existsSync(path.join(root, '.update/journal.json')), false);
  });
}
test('a killed process leaves a recoverable journal', t => {
  const root = workspace(t); seed(root);
  const code = `const u=require(${JSON.stringify(updaterPath)}); const fs=require('fs'); const root=process.argv[1]; const files=new Map(${JSON.stringify([...payload()].map(([k,v])=>[k,v.toString()]))}.map(([k,v])=>[k,Buffer.from(v)])); u.install(root,files,'1.0.1',{hook(p){if(p==='replaced')process.exit(77)}});`;
  assert.equal(spawnSync(process.execPath, ['-e', code, root]).status, 77);
  assert.equal(updater.recover(root), true); expectVersion(root, '1.0.0');
  assert.equal(updater.recover(root), false);
});
test('failed next update preserves the previous successful rollback backup', t => {
  const root = workspace(t); seed(root);
  updater.install(root, payload('1.0.1'), '1.0.1');
  assert.throws(() => updater.install(root, payload('1.0.2'), '1.0.2', { hook(p) { if (p === 'verified') throw new Error('stop'); } }), /stop/);
  expectVersion(root, '1.0.1'); assert.equal(updater.rollback(root), '1.0.0'); expectVersion(root, '1.0.0');
});
test('only the latest successful previous release is retained', t => {
  const root = workspace(t); seed(root);
  updater.install(root, payload('1.0.1'), '1.0.1'); updater.install(root, payload('1.0.2'), '1.0.2');
  assert.equal(fs.readdirSync(path.join(root, '.update')).filter(n => n.startsWith('backup-')).length, 1);
  assert.equal(updater.rollback(root), '1.0.1'); expectVersion(root, '1.0.1');
});
test('corrupt backup is detected before changing the installed release', t => {
  const root = workspace(t); seed(root); updater.install(root, payload(), '1.0.1');
  const tx = JSON.parse(fs.readFileSync(path.join(root, '.update/previous.json')));
  fs.writeFileSync(path.join(root, '.update', tx.id, 'README.md'), 'corrupt backup');
  assert.throws(() => updater.rollback(root), /checksum/); expectVersion(root, '1.0.1');
  assert.ok(fs.existsSync(path.join(root, '.update/journal.json')));
});
test('missing files, version mismatch and invalid entrypoint never modify install', t => {
  const root = workspace(t); seed(root);
  for (const change of [m => m.delete('README.md'), m => m.set('VERSION', Buffer.from('2.0.0')), m => m.set('SKILL.md', Buffer.from('wrong skill'))]) {
    const files = payload(); change(files); assert.throws(() => updater.install(root, files, '1.0.1')); expectVersion(root, '1.0.0');
  }
});
test('symlink targets are refused without writing outside the installation', t => {
  const root = workspace(t), outside = workspace(t); seed(root);
  fs.symlinkSync(outside, path.join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  const files = payload(); files.set('linked/escape.txt', Buffer.from('escape'));
  assert.throws(() => updater.install(root, files, '1.0.1'), /Symlink/); expectVersion(root, '1.0.0');
  assert.equal(fs.existsSync(path.join(outside, 'escape.txt')), false);
});
test('validated ZIP extraction supports GitHub root directories', () => {
  const entries = [['repo/', ''], ['repo/.update/', ''], ...[...payload()].map(([name, data]) => ['repo/' + name, data])];
  const files = updater.unpackZip(zip(entries)); updater.validatePackage(files, '1.0.1');
  assert.equal(files.get('VERSION').toString(), '1.0.1\n');
});
test('ZIP rejects traversal, duplicate paths, symlinks, corrupt CRC and reserved runtime files', () => {
  for (const entries of [
    [['repo/../escape', 'bad']], [['/repo/escape', 'bad']], [['repo/a', 'a'], ['repo/A', 'b']],
    [['repo/link', 'target', true]], [['repo/.update/journal.json', '{}']], [['repo/a', 'a'], ['other/b', 'b']],
  ]) assert.throws(() => updater.unpackZip(zip(entries)));
  const bad = zip([['repo/a', 'a']]); bad[14] ^= 1;
  // Also change central-directory CRC, preserving header consistency but failing integrity.
  const directory = bad.readUInt32LE(bad.length - 6); bad[directory + 16] ^= 1;
  assert.throws(() => updater.unpackZip(bad), /Corrupt/);
  assert.throws(() => updater.unpackZip(Buffer.alloc(24)));
});
test('version comparison never treats equality or a downgrade as an update', () => {
  assert.equal(updater.newer('1.0.10', '1.0.9'), true);
  assert.equal(updater.newer('1.0.1', '1.0.1'), false);
  assert.equal(updater.newer('0.9.9', '1.0.1'), false);
  assert.throws(() => updater.newer('oops', '1.0.0'));
});
function remote(v = '1.0.1', corrupt = false) {
  const sha = 'a'.repeat(40), urls = [];
  return { urls, fetchImpl: async url => {
    urls.push(url);
    if (url.includes('/git/ref/')) return new Response(JSON.stringify({ object: { sha } }));
    if (url.endsWith('/VERSION')) return new Response(v);
    if (url.includes('/zip/')) return new Response(corrupt ? Buffer.from('bad zip') : zip([...payload(v)].map(([n,d]) => ['repo/' + n,d])));
    throw new Error('unexpected URL');
  } };
}
test('network update pins version and archive to one commit and checks once daily', async t => {
  const root = workspace(t); seed(root); const server = remote();
  assert.equal((await updater.runUpdate(root, server)).status, 'updated'); expectVersion(root, '1.0.1');
  assert.ok(server.urls.slice(1).every(url => url.includes('a'.repeat(40))));
  assert.equal((await updater.runUpdate(root, server)).status, 'checked'); assert.equal(server.urls.length, 3);
});
test('network failures and corrupt archive preserve old version', async t => {
  for (const server of [{ fetchImpl: async () => { throw new Error('offline'); } }, remote('1.0.1', true)]) {
    const root = workspace(t); seed(root);
    await assert.rejects(updater.runUpdate(root, server)); expectVersion(root, '1.0.0');
    assert.equal(fs.existsSync(path.join(root, '.update/lock.json')), false);
  }
});
test('same/older remote versions are not downloaded or installed', async t => {
  for (const v of ['1.0.0', '0.9.9']) {
    const root = workspace(t); seed(root); const server = remote(v);
    assert.equal((await updater.runUpdate(root, server)).status, 'current'); assert.equal(server.urls.length, 2); expectVersion(root, '1.0.0');
  }
});
test('live lock prevents concurrent updates and Git checkouts are untouched', async t => {
  const root = workspace(t); seed(root);
  fs.writeFileSync(path.join(root, '.update/lock.json'), JSON.stringify({ pid: process.pid }));
  assert.equal((await updater.runUpdate(root, remote())).status, 'busy'); expectVersion(root, '1.0.0');
  fs.mkdirSync(path.join(root, '.git'));
  assert.equal((await updater.runUpdate(root, remote())).status, 'checkout');
});
test('truncated stale lock can recover without stealing a newly written lock', async t => {
  const root = workspace(t); seed(root); const lock = path.join(root, '.update/lock.json');
  fs.writeFileSync(lock, '{');
  assert.equal((await updater.runUpdate(root, remote())).status, 'busy');
  const old = new Date(Date.now() - 180000); fs.utimesSync(lock, old, old);
  assert.equal((await updater.runUpdate(root, remote())).status, 'updated'); expectVersion(root, '1.0.1');
});
test('recovery runs before daily stamp or network requests', async t => {
  const root = workspace(t); seed(root);
  const code = `const u=require(${JSON.stringify(updaterPath)}); const files=new Map(${JSON.stringify([...payload()].map(([k,v])=>[k,v.toString()]))}.map(([k,v])=>[k,Buffer.from(v)])); u.install(process.argv[1],files,'1.0.1',{hook(p){if(p==='replaced')process.exit(77)}});`;
  assert.equal(spawnSync(process.execPath, ['-e', code, root]).status, 77);
  fs.writeFileSync(path.join(root, '.update/last_check'), new Date().toISOString().slice(0, 10));
  assert.equal((await updater.runUpdate(root, { fetchImpl: async () => { throw new Error('Network must not be used'); } })).status, 'recovered');
  expectVersion(root, '1.0.0');
});
