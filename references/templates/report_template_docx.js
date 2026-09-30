// =============================================================================
// 实验报告 docx 生成器模板 (experiment-report-skill)
// -----------------------------------------------------------------------------
// 用法：把本文件复制到具体项目里，改 REPORT 内容（封面信息 + 真实正文 + 公式 + 截图）
//      然后 `node report_template_docx.js` 即可产出 实验报告.docx。
//
// 三条硬性要求（已在 helper 里实现，直接复用即可）：
//   1) 公式原生 OMML，非图片            → math() / frac() / sup() / sub() / sqrt()
//   2) 正文宋体五号 (10.5pt = 21hp)      → body()  (eastAsia=宋体 三属性齐全)
//   3) 序号用活序号 (Word 自动编号)       → numbering + listItem()
// 结构：封面页 → 目录页 → 正文章节(十章)
// =============================================================================
const {
  Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType, HeadingLevel,
  LevelFormat, NumberFormat, Footer, PageNumber,
  TableOfContents, SectionType, Math: OoxmlMath, MathRun,
  MathFraction, MathSuperScript, MathSubScript, MathRadical,
} = require("docx");
const fs = require("fs");
const path = require("path");
const { imageSize: sizeOf } = require("image-size");  // named export supported by the pinned version

// ---------- font / size constants ----------
const BODY_HP = 21;                       // 五号 = 10.5pt = 21 half-points
const BODY_FONT = { ascii: "Times New Roman", hAnsi: "Times New Roman", eastAsia: "宋体" };
const HEAD_FONT = { ascii: "Times New Roman", hAnsi: "Times New Roman", eastAsia: "黑体" };

// ---------- paragraph helpers ----------
// 正文：宋体五号、1.5倍行距、首行缩进2个10.5pt汉字(420twip)
function body(text, opts = {}) {
  return new Paragraph({
    spacing: { line: 360 },
    indent: { firstLine: 420 },
    alignment: AlignmentType.JUSTIFIED,
    children: [new TextRun({ text, size: BODY_HP, font: BODY_FONT, ...opts })],
  });
}
// 正文（无首行缩进，用于图注/紧贴标题的说明）
function bodyNoIndent(text, opts = {}) {
  return new Paragraph({
    spacing: { line: 360 },
    keepNext: opts.keepNext || false,
    alignment: opts.align || AlignmentType.LEFT,
    children: [new TextRun({ text, size: BODY_HP, font: BODY_FONT, ...(opts.run || {}) })],
  });
}
// 章节标题（活序号章节也可用 HEADING，进入目录）
function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    numbering: { reference: "chapters", level: 0 },
    keepNext: true,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, bold: true, size: 32, font: HEAD_FONT })], // 小三 16pt
  });
}
function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    numbering: { reference: "chapters", level: 1 },
    keepNext: true,
    spacing: { before: 180, after: 100 },
    children: [new TextRun({ text, bold: true, size: 28, font: HEAD_FONT })], // 四号 14pt
  });
}
// 活序号列表项（自动编号）
function listItem(text, instance = 0, level = 0, opts = {}) {
  return new Paragraph({
    numbering: { reference: "autolist", level, instance },
    spacing: { line: 360 },
    children: [new TextRun({ text, size: BODY_HP, font: BODY_FONT, ...opts })],
  });
}
// 图片：按真实宽高比缩放，maxWidthPx 为目标像素宽
function image(filePath, maxWidthPx = 460, caption) {
  const buf = fs.readFileSync(filePath);
  const dim = sizeOf(buf);
  const ratio = dim.height / dim.width;
  const w = Math.min(maxWidthPx, dim.width, 560 / ratio);
  const h = Math.round(w * ratio);
  const out = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 60 },
      keepNext: Boolean(caption),
      children: [new ImageRun({ data: buf, transformation: { width: w, height: h }, type: "png" })],
    }),
  ];
  if (caption) {
    out.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [new TextRun({ text: caption, size: 18, font: BODY_FONT })], // 小五 9pt 图注
    }));
  }
  return out;
}

// ---------- OMML native formula helpers (NO images) ----------
function txt(t) {
  if (typeof t !== "string" || !t.trim()) throw new Error("公式文本不能为空");
  return new MathRun(t);
}
function frac(num, den) { return new MathFraction({ numerator: num, denominator: den }); }
function sup(base, s) { return new MathSuperScript({ children: base, superScript: s }); }
function sub(base, s) {
  if (!base.length || !s.length) throw new Error("下标必须包含基底和下标内容");
  return new MathSubScript({ children: base, subScript: s });
}
function sqrt(inner, degree) {
  return new MathRadical({ children: inner, ...(degree ? { degree } : {}) });
}
// 居中独立公式行
function formula(children) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 80, after: 80 },
    children: [new OoxmlMath({ children })],
  });
}

// =============================================================================
// REPORT —— 填入本次真实实验内容。null / 空列表会报错，不会带入示例结果。
// 公式使用 formula([sub([txt("x")], [txt("t−1")]), ...]) 等原生组件。
// 本生成器只负责排版；原始数据、前端确认、四张真实截图、三轮自检仍须完成。
// =============================================================================
const REPORT = {
  cover: { school: "（请填写学校）", course: "（请填写课程）", student: "（请填写姓名 / 学号）", date: "（请填写日期）" },
  name: null,
  objectives: [],
  environment: null,
  metrics: null,
  // 每个方法：{ title: "方法名称", description: "真实原理", formulas: [formula([...])] }
  methods: [],
  implementation: null,
  parameters: null,
  // 至少四张本次真实截图：{ id: "overview", file: "screenshots/01.png", caption: "说明", section: "implementation" 或 "results" }
  figures: [],
  results: null,
  analysis: null,
  improvements: [],
  conclusion: null,
  reflection: null,
  appendix: null,
};

function validateReport(report, baseDir) {
  for (const key of ["name", "environment", "metrics", "implementation", "parameters", "results", "analysis", "conclusion", "reflection", "appendix"]) {
    if (typeof report[key] !== "string" || !report[key].trim()) throw new Error(`缺少本次实验内容：${key}`);
  }
  for (const key of ["objectives", "improvements"]) {
    if (!Array.isArray(report[key]) || !report[key].length || report[key].some(x => typeof x !== "string" || !x.trim())) throw new Error(`缺少有效列表：${key}`);
  }
  if (!report.cover || ["school", "course", "student", "date"].some(k => typeof report.cover[k] !== "string" || !report.cover[k].trim())) throw new Error("缺少封面信息，可保留明确待填占位");
  if (!Array.isArray(report.methods) || !report.methods.length || report.methods.some(m => !m.title?.trim() || !m.description?.trim())) throw new Error("缺少方法原理");
  if (!Array.isArray(report.figures) || report.figures.length < 4) throw new Error("至少需要四张本次真实截图");
  const ids = new Set();
  for (const fig of report.figures) {
    if (!fig.id || ids.has(fig.id) || !fig.caption?.trim() || !["implementation", "results"].includes(fig.section)) throw new Error("截图 id / 图注 / 所属章节无效");
    ids.add(fig.id);
    if (typeof fig.file !== "string" || !fs.existsSync(path.resolve(baseDir, fig.file))) throw new Error(`截图文件不存在：${fig.file}`);
    const dim = sizeOf(fs.readFileSync(path.resolve(baseDir, fig.file)));
    if (dim.type !== "png" || !dim.width || !dim.height) throw new Error(`截图必须为有效 PNG：${fig.file}`);
  }
}
function buildReport(report, baseDir = process.cwd()) {
  validateReport(report, baseDir);
  // Numbers follow display order, regardless of input order.
  const orderedFigures = ["implementation", "results"].flatMap(section => report.figures.filter(f => f.section === section));
  const numbers = new Map(orderedFigures.map((f, i) => [f.id, i + 1]));
  const figureBlocks = section => report.figures.filter(f => f.section === section).flatMap(f => [
    bodyNoIndent(`见图 ${numbers.get(f.id)}：${f.caption}。`, { keepNext: true }),
    ...image(path.resolve(baseDir, f.file), 460, `图 ${numbers.get(f.id)}  ${f.caption}`),
  ]);
  const margin = { top: 1440, bottom: 1440, left: 1440, right: 1440 };
  const coverLine = (text, size, before = 0) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before }, children: [new TextRun({ text, size, font: HEAD_FONT })] });
  const sections = [{
    properties: { page: { margin } },
    children: [coverLine(report.cover.school, 36, 1800), coverLine("实 验 报 告", 56, 360), coverLine(report.name, 28, 720),
      coverLine(`课程：${report.cover.course}`, 28, 900), coverLine(`姓名 / 学号：${report.cover.student}`, 28, 180), coverLine(`日期：${report.cover.date}`, 28, 180)],
  }, {
    properties: { type: SectionType.NEXT_PAGE, page: { margin } },
    children: [coverLine("目  录", 36), new TableOfContents("目录", { hyperlink: true, headingStyleRange: "1-2" }),
      bodyNoIndent("（右键目录 → 更新域，可刷新页码）")],
    // NEXT_PAGE on the body section supplies the page break. Do not add a second break.
  }, {
    properties: { type: SectionType.NEXT_PAGE, page: { margin, pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL } } },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER,
      children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, font: BODY_FONT })] })] }) },
    children: [
      h1("实验名称"), body(report.name),
      h1("实验目的"), ...report.objectives.map(t => listItem(t, 1)),
      h1("实验环境与任务定义"), h2("环境设定"), body(report.environment), h2("评价指标"), body(report.metrics),
      h1("算法 / 方法原理"), ...report.methods.flatMap(m => [h2(m.title), body(m.description), ...(m.formulas || [])]),
      h1("实验实现"), h2("代码结构与实现"), body(report.implementation), h2("参数设置"), body(report.parameters), h2("前端展示"), ...figureBlocks("implementation"),
      h1("实验结果"), body(report.results), ...figureBlocks("results"),
      h1("结果分析"), body(report.analysis), ...report.improvements.map(t => listItem(t, 2)),
      h1("实验结论"), body(report.conclusion),
      h1("心得感悟"), body(report.reflection),
      h1("附录"), body(report.appendix),
    ],
  }];
  return new Document({ creator: "experiment-report-skill", title: report.name,
    features: { updateFields: true },
    styles: { default: {
      document: { run: { font: BODY_FONT, size: BODY_HP } },
      heading1: { run: { font: HEAD_FONT, color: "000000", bold: true, size: 32 }, paragraph: { keepNext: true, outlineLevel: 0 } },
      heading2: { run: { font: HEAD_FONT, color: "000000", bold: true, size: 28 }, paragraph: { keepNext: true, outlineLevel: 1 } },
    } },
    numbering: { config: [{ reference: "autolist", levels: [
      { level: 0, format: LevelFormat.DECIMAL, text: "%1.", start: 1, alignment: AlignmentType.START, style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
      { level: 1, format: LevelFormat.LOWER_LETTER, text: "%2)", start: 1, alignment: AlignmentType.START, style: { paragraph: { indent: { left: 1440, hanging: 360 } } } },
    ] }, { reference: "chapters", levels: [
      { level: 0, format: LevelFormat.CHINESE_COUNTING, text: "%1、", start: 1, style: { paragraph: { indent: { left: 480, hanging: 480 } } } },
      { level: 1, format: LevelFormat.DECIMAL, text: "%1.%2", start: 1, isLegalNumberingStyle: true, style: { paragraph: { indent: { left: 480, hanging: 480 } } } },
    ] }] }, sections });
}
async function writeReport(report, output = "实验报告.docx", baseDir = process.cwd()) {
  const buffer = await Packer.toBuffer(buildReport(report, baseDir));
  fs.writeFileSync(output, buffer);
  return output;
}
module.exports = { REPORT, buildReport, writeReport, validateReport, txt, frac, sup, sub, sqrt, formula };
if (require.main === module) writeReport(REPORT).then(out => console.log(`DOCX OK -> ${out}`)).catch(error => { console.error(error.message); process.exitCode = 1; });
