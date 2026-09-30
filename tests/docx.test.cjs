const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { deflateSync } = require('node:zlib');
const { spawnSync } = require('node:child_process');
const { crc32 } = require('../.update/updater.cjs');
const template = require('../references/templates/report_template_docx.js');

function png(width, height) {
  const chunk = (name, data) => { const type = Buffer.from(name), out = Buffer.alloc(12 + data.length); out.writeUInt32BE(data.length); type.copy(out, 4); data.copy(out, 8); out.writeUInt32BE(crc32(Buffer.concat([type,data])), out.length - 4); return out; };
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  const pixels = Buffer.alloc(height * (width * 3 + 1), 235);
  for (let y = 0; y < height; y++) pixels[y * (width * 3 + 1)] = 0;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
}
function fixture(root) {
  // Synthetic layout fixtures only. This is not a scientific experiment report.
  fs.writeFileSync(path.join(root, 'fixture.png'), png(800, 400));
  const text = '模板回归测试正文';
  return {
    cover: { school: '模板回归测试', course: '排版测试', student: '测试数据', date: '测试日期' }, name: '模板回归测试',
    objectives: ['目标一', '目标二'], environment: text, metrics: text,
    methods: [{ title: '公式测试', description: text, formulas: [template.formula([
      template.sub([template.txt('x')], [template.txt('t−1')]), template.txt(' ← Denoise('),
      template.sub([template.txt('x')], [template.txt('t')]), template.txt(', '),
      template.sub([template.txt('c')], [template.txt('text')]), template.txt(', t)'),
    ])] }], implementation: text, parameters: text,
    figures: [{ id: 'result', section: 'results', file: 'fixture.png', caption: '结果测试图' },
      ...[1,2,3].map(i => ({ id: 'implementation' + i, section: 'implementation', file: 'fixture.png', caption: '实现测试图' + i }))],
    results: text, analysis: text, improvements: ['改进一', '改进二'], conclusion: text, reflection: text, appendix: text,
  };
}
test('unfilled report, empty formula base and insufficient screenshots fail explicitly', () => {
  assert.throws(() => template.buildReport(template.REPORT), /缺少本次实验/);
  assert.throws(() => template.sub([], [template.txt('t−1')]), /下标/);
  assert.throws(() => template.txt(''), /公式文本/);
});
test('Word preserves formula content, numbering, figure references and report sections', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'experiment-docx-test-'));
  t.after(() => { assert.ok(fs.realpathSync(root).startsWith(fs.realpathSync(os.tmpdir()) + path.sep)); fs.rmSync(root, { recursive: true }); });
  const report = fixture(root), output = path.join(root, 'fixture.docx');
  assert.throws(() => template.buildReport({ ...report, figures: report.figures.slice(1) }, root), /四张/);
  assert.throws(() => template.buildReport({ ...report, results: '' }, root), /results/);
  assert.throws(() => template.buildReport({ ...report, figures: report.figures.map(f => ({ ...f, file: 'missing.png' })) }, root), /不存在/);
  await template.writeReport(report, output, root);
  const checked = spawnSync(process.env.TEST_PYTHON || 'python', [path.join(__dirname, 'check_docx.py'), output], { encoding: 'utf8' });
  assert.equal(checked.status, 0, checked.stdout + checked.stderr);
  if (process.env.DOCX_QA_DIR) {
    fs.mkdirSync(process.env.DOCX_QA_DIR, { recursive: true }); fs.copyFileSync(output, path.join(process.env.DOCX_QA_DIR, 'fixture.docx'));
  }
});
