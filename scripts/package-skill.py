"""Build a single installable, deterministic Skill ZIP from explicit source paths."""
import hashlib
import json
import pathlib
import stat
import zipfile

root = pathlib.Path(__file__).resolve().parents[1]
config = json.loads((root / 'skill-release.json').read_text(encoding='utf-8'))
version = json.loads((root / 'package.json').read_text(encoding='utf-8'))['version']
folder, asset = config['directory'], config['asset']
files = {}
for included in config['include']:
    source = root / included
    if not source.exists():
        raise ValueError('Missing release source: ' + included)
    candidates = source.rglob('*') if source.is_dir() else [source]
    for file in candidates:
        if file.is_symlink():
            raise ValueError('Release source cannot contain links')
        if file.is_file():
            relative = file.relative_to(root).as_posix()
            if any(p in {'.git', 'node_modules', '__pycache__', 'browser-data', '.playwright'} for p in file.parts):
                raise ValueError('Private/runtime files must not be packaged')
            if file.name.endswith(('.pyc', '.log')) or file.name in {'.env', 'config.json', '.runtime.json'}:
                raise ValueError('Private/generated file: ' + relative)
            body = file.read_bytes()
            try:
                body.decode("utf-8")
                if b"\0" not in body:
                    body = body.replace(b"\r\n", b"\n")
            except UnicodeDecodeError:
                pass
            files[relative] = body
front = files['SKILL.md'].decode('utf-8')
if '\nname: ' + folder + '\n' not in front.replace('\r\n', '\n'):
    raise ValueError('Skill name must match package directory')
manifest = {'schemaVersion': 1, 'directory': folder, 'version': version,
            'repository': config['repository'],
            'files': {name: hashlib.sha256(data).hexdigest() for name, data in sorted(files.items())}}
files['skill-package.json'] = (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode()
output = root / 'release'
output.mkdir(exist_ok=True)
target = output / asset
with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for name, data in sorted(files.items()):
        info = zipfile.ZipInfo(folder + '/' + name, date_time=(2026, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.create_system = 3
        info.external_attr = (stat.S_IFREG | 0o644) << 16
        archive.writestr(info, data)
digest = hashlib.sha256(target.read_bytes()).hexdigest()
(output / 'SHA256SUMS.txt').write_text(digest + '  ' + asset + '\n', encoding='utf-8')
print(json.dumps({'directory': folder, 'version': version, 'asset': asset, 'sha256': digest,
                  'bytes': target.stat().st_size, 'files': len(files)}, ensure_ascii=False))
