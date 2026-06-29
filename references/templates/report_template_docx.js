// =============================================================================
// 实验报告 docx 生成器模板 (experiment-report-skill)
// -----------------------------------------------------------------------------
// 用法：把本文件复制到具体项目里，改 CONTENT 部分（封面信息 + 正文段落 + 公式 + 截图）
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
  PageBreak, PageOrientation, LevelFormat, NumberFormat, Footer, PageNumber,
  TableOfContents, StyleLevel, SectionType, Math: OoxmlMath, MathRun,
  MathFraction, MathSuperScript, MathSubScript, MathSubSuperScript, MathRadical,
  convertMillimetersToTwip,
} = require("docx");
const fs = require("fs");
const path = require("path");
const { imageSize: sizeOf } = require("image-size");  // image-size v2: named export

// ---------- font / size constants ----------
const BODY_HP = 21;                       // 五号 = 10.5pt = 21 half-points
const BODY_FONT = { ascii: "Times New Roman", hAnsi: "Times New Roman", eastAsia: "宋体" };
const HEAD_FONT = { ascii: "Times New Roman", hAnsi: "Times New Roman", eastAsia: "黑体" };

// ---------- paragraph helpers ----------
// 正文：宋体五号、1.5倍行距、首行缩进2字符(480twip)
function body(text, opts = {}) {
  return new Paragraph({
    spacing: { line: 360 },
    indent: { firstLine: 480 },
    alignment: AlignmentType.JUSTIFIED,
    children: [new TextRun({ text, size: BODY_HP, font: BODY_FONT, ...opts })],
  });
}
// 正文（无首行缩进，用于图注/紧贴标题的说明）
function bodyNoIndent(text, opts = {}) {
  return new Paragraph({
    spacing: { line: 360 },
    alignment: opts.align || AlignmentType.LEFT,
    children: [new TextRun({ text, size: BODY_HP, font: BODY_FONT, ...(opts.run || {}) })],
  });
}
// 章节标题（活序号章节也可用 HEADING，进入目录）
function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, bold: true, size: 32, font: HEAD_FONT })], // 小三 16pt
  });
}
function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 180, after: 100 },
    children: [new TextRun({ text, bold: true, size: 28, font: HEAD_FONT })], // 四号 14pt
  });
}
// 活序号列表项（自动编号）
function listItem(text, ref = "autolist", level = 0, opts = {}) {
  return new Paragraph({
    numbering: { reference: ref, level },
    spacing: { line: 360 },
    children: [new TextRun({ text, size: BODY_HP, font: BODY_FONT, ...opts })],
  });
}
// 图片：按真实宽高比缩放，maxWidthPx 为目标像素宽
function image(filePath, maxWidthPx = 460, caption) {
  const buf = fs.readFileSync(filePath);
  const dim = sizeOf(buf);
  const ratio = dim.height / dim.width;
  const w = Math.min(maxWidthPx, dim.width);
  const h = Math.round(w * ratio);
  const out = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 60 },
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
function txt(t) { return new MathRun(t); }                 // math 文本
function frac(num, den) { return new MathFraction({ numerator: num, denominator: den }); }
function sup(base, s) { return new MathSuperScript({ children: base, superScript: s }); }
function sub(base, s) { return new MathSubScript({ children: base, subScript: s }); }
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
// CONTENT —— 按实际报告改写这一段
// =============================================================================
const ASSETS = "实验报告_assets";   // 截图所在目录（相对本脚本运行目录）

const sections = [];

// ---------- 1. 封面 ----------
sections.push({
  properties: {
    type: SectionType.NEXT_PAGE,
    page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } },
  },
  children: [
    new Paragraph({ spacing: { before: 2400 }, alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "人工智能综合实践Ⅱ", size: 36, font: HEAD_FONT })] }),
    new Paragraph({ alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "实 验 报 告", size: 56, bold: true, font: HEAD_FONT })] }),
    new Paragraph({ spacing: { before: 1200 }, alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "（作业名称占位：基于开源多模态大模型的图文理解系统）", size: 28, font: BODY_FONT })] }),
    new Paragraph({ spacing: { before: 1800 }, alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "课程：人工智能综合实践Ⅱ", size: 28, font: BODY_FONT })] }),
    new Paragraph({ alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "姓名 / 学号：__________ （请填写）", size: 28, font: BODY_FONT })] }),
    new Paragraph({ alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "日期：2026 年", size: 28, font: BODY_FONT })] }),
  ],
});

// ---------- 2. 目录 ----------
sections.push({
  properties: {
    type: SectionType.NEXT_PAGE,
    page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } },
  },
  children: [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 },
      children: [new TextRun({ text: "目  录", size: 36, bold: true, font: HEAD_FONT })] }),
    new TableOfContents("目录", {
      hyperlink: true, headingStyleRange: "1-3",
      stylesWithLevels: [new StyleLevel("Heading1", 1), new StyleLevel("Heading2", 2)],
    }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120 },
      children: [new TextRun({ text: "（右键目录 → 更新域，可刷新页码）", italics: true, size: 18, color: "808080", font: BODY_FONT })] }),
    new Paragraph({ children: [new PageBreak()] }),
  ],
});

// ---------- 3. 正文 ----------
sections.push({
  properties: {
    type: SectionType.NEXT_PAGE,
    page: {
      margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
      pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL },
    },
  },
  footers: { default: new Footer({ children: [new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, font: BODY_FONT })],
  })] }) },
  children: [
    // 一、实验名称
    h1("一、实验名称"),
    body("基于开源多模态大模型（BLIP / CLIP / Stable Diffusion）的轻量级图文理解系统。"),
    // 二、实验目的（活序号）
    h1("二、实验目的"),
    listItem("理解多模态建模流程，掌握在消费级硬件上调用开源预训练大模型完成图生文、文搜图、文生图三类任务。"),
    listItem("复现并对比 BLIP 的视觉-语言生成、CLIP 的对比学习跨模态检索、Stable Diffusion 的潜空间扩散生成。"),
    listItem("将三个任务封装为可交互的 Web 系统，验证端到端可用的多模态应用管线。"),
    // 三、实验环境
    h1("三、实验环境与任务定义"),
    h2("3.1 环境设定"),
    body("硬件：NVIDIA RTX 4060 Laptop GPU，8GB 显存，CUDA 12.8。软件：Python 3.13，PyTorch 2.9，transformers 4.57，diffusers 0.38，Flask。模型均为冻结预训练权重、本地推理、未微调：图生文 Salesforce/blip-image-captioning-base，文搜图 openai/clip-vit-base-patch32，文生图 runwayml/stable-diffusion-v1-5（FP16）。测试集为 scikit-image 内置 9 张确定性图像。"),
    h2("3.2 评价指标"),
    body("图生文以人工可读性 + 条件/无条件对比；文搜图以 Top-1/Top-3 命中率 + 余弦相似度；文生图以 CLIP Score（图文余弦相似度）。"),
    // 四、算法原理（含原生公式）
    h1("四、算法 / 方法原理"),
    h2("4.1 文搜图：CLIP 与余弦相似度"),
    body("CLIP 将图像与文本分别编码到同一特征空间，归一化后用余弦相似度衡量匹配度，公式如下（原生 OMML 公式，非图片）："),
    formula([
      txt("cos(θ) = "),
      frac([txt("E_I"), txt(" · "), txt("E_T")], [txt("‖E_I‖"), txt(" ‖"), txt("E_T‖")]),
    ]),
    h2("4.2 图生文：BLIP"),
    body("BLIP 由 ViT 视觉编码器 + 文本解码器组成，视觉特征与文本前缀拼接后由语言头解码出描述，支持条件生成（如前缀 a picture of）。"),
    h2("4.3 文生图：Stable Diffusion"),
    body("基于潜空间扩散：从随机噪声潜变量出发，文本经 CLIP 文本编码器作条件注入 UNet 迭代去噪，再由 VAE 解码回像素。去噪步数与引导强度公式可写为："),
    formula([
      txt("x"), sub([], [txt("t-1")]) && txt(""),
      txt(" ← "), txt("Denoise("), txt("x"), sub([txt("")], [txt("t")]), txt(", "), txt("c"), sub([txt("")], [txt("text")]), txt(", "), txt("t)"),
    ]),
    // 五、实验实现
    h1("五、实验实现"),
    h2("5.1 代码结构"),
    body("src/ 下含 models.py（模型单例懒加载）、task_caption.py / task_retrieval.py / task_generate.py（三任务批量推理）、app.py（Flask 后端）；static/ 为学术简洁风前端；results/ 存三任务原始 JSON。"),
    h2("5.2 参数设置"),
    body("图生文 num_beams=5, max_new_tokens=50；文搜图归一化余弦相似度 Top-3；文生图 seed=42, steps=25, guidance=7.5, 512×512, FP16 + attention_slicing。"),
    h2("5.3 前端展示"),
    body("图生文实时演示截图见图 1，文搜图检索见图 3，文生图见图 5。"),
    ...image(path.join(ASSETS, "01-caption-live.png"), 460, "图 1  图生文实时演示"),
    ...image(path.join(ASSETS, "03-retrieval-live.png"), 460, "图 2  文搜图实时演示（输入 a cat → Top-3）"),
    ...image(path.join(ASSETS, "05-generate-live.png"), 460, "图 3  文生图实时演示"),
    // 六、实验结果
    h1("六、实验结果"),
    body("图生文：9 张图生成描述，常见物体（cat/coffee/camera/coins/horse）准确，cell/text 误判。文搜图：Top-1 命中 7/9、Top-3 命中 9/9（如实记录 a person、a page of text 两处 Top-1 失败）。文生图：4 张图 CLIP score 0.31–0.33，seed=42 可复现。"),
    ...image(path.join(ASSETS, "06-generate-batch.png"), 460, "图 4  文生图批量结果"),
    // 七、结果分析
    h1("七、结果分析"),
    body("图生文在非自然图像上偏差源于训练数据中该类图像稀少；文搜图对低信息量/歧义图像（稀疏文字、人形剪影）鲁棒性不足；文生图质量与提示具体度正相关，细节最丰富的提示 CLIP score 最高。改进方向（活序号）："),
    listItem("图生文换 BLIP-large / BLIP-2 改善非自然图像描述（需更大显存）。"),
    listItem("文搜图用 ViT-L/14 或描述增强检索（先 BLIP 生成描述再文本匹配）。"),
    listItem("文生图引入 ControlNet 做结构控制，或换 SDXL/SD3 提升分辨率。"),
    // 八、结论
    h1("八、实验结论"),
    body("在 8GB 消费级显卡上用三个开源模型搭建了端到端可用的多模态系统，三任务结果真实可复现，并如实记录了失败案例与原因。"),
    // 九、心得感悟
    h1("九、心得感悟"),
    body("（此段保持学生口吻、去套话。占位：做完后填入真实感受。）"),
    // 十、附录
    h1("十、附录"),
    body("原始结果文件：results/captioning.json、results/retrieval.json、results/generation.json。截图来源：screenshots/，由 screenshot.py 按 manifest 截取。"),
  ],
});

// ---------- document assembly ----------
const doc = new Document({
  creator: "experiment-report-skill",
  title: "实验报告",
  numbering: {
    config: [{
      reference: "autolist",
      levels: [
        { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.START,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
        { level: 1, format: LevelFormat.LOWER_LETTER, text: "%2)", alignment: AlignmentType.START,
          style: { paragraph: { indent: { left: 1440, hanging: 360 } } } },
      ],
    }],
  },
  sections,
});

Packer.toBuffer(doc).then(buf => {
  const out = "实验报告.docx";
  fs.writeFileSync(out, buf);
  console.log("DOCX OK ->", out);
});
