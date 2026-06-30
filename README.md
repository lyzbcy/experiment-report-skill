# 🧪 Experiment Report Skill

一个通用的 AI 实验报告生成工作流。你只需要描述实验内容，它帮你完成：

**实验实现 → 前端可视化 → 截图 → 实验报告（md + docx 双交付）**

> 和"你给我素材我帮你写"的论文 skill 不同——这个 skill 的第一原则是：**实验必须真实跑通、数据不许编造、失败要如实写**。

## ✨ 它能做什么

- 🔬 **自动实现实验** — 描述你的实验，AI 帮你跑通，产出可复查的原始数据
- 🖥️ **生成前端展示** — 学术简洁风可视化页面（策略图、曲线图、对比图），先给你确认效果
- 📸 **规范截图入库** — 按 screenshot-manifest 截图，前端截图直接进报告，真实数据不造假
- 📝 **双格式实验报告** — 同时产出 `实验报告.md` 和 `实验报告.docx`
- 🔍 **多轮自检** — 交付前强制 ≥3 轮自检修复循环，报告里的每个数字都与原始数据交叉校验

## 📐 docx 三大硬性要求

产出的 docx 不是 md 的简单导出，而是用 Node + `docx` 库按规范重新构建，自检逐项验证：

| 要求 | 说明 |
|------|------|
| **原生公式** | 用 OMML（`OoxmlMath`/分数/上下标/根号）构造，**禁止用图片** |
| **正文宋体五号** | 五号 = 10.5pt，字体三属性齐全（ascii/hAnsi/**eastAsia**，只设 ascii 是最常见的坑） |
| **活序号** | 用 Word 自动编号（`numbering`），增删条目自动重排，**禁止手敲 1.2.3.** |

外加：封面页 + 自动目录（TOC）+ 正文页码从 1 重计。

## 🚀 怎么用

1. 在你的 AI 工具中安装这个 Skill（ZCode / Claude Code / Codex / Cursor 等）
2. 告诉它你要做什么实验（比如："我要做 SARSA 和 Q-learning 的对比实验"）
3. 等它跑完实验 → 生成前端 → **你确认效果** → 自动写 md + docx 报告 → 自检

就这么简单。

## 🔧 核心原则

| 原则 | 说明 |
|------|------|
| **数据真实** | 所有图表必须来自实际运行结果，不许伪造；失败案例如实记录 |
| **前端先行** | 先做可视化页面让你确认，确认后才写报告 |
| **双格式交付** | 同时产出 md + docx，docx 满足三大硬性要求 |
| **多轮自检** | ≥3 轮自检修复，报告数字与原始数据逐一交叉校验 |
| **去 AI 味** | 前端走学术简洁风，心得感悟去套话、去模板腔 |
| **截图规范** | 按 screenshot-manifest 规划 DOM id，每张截图自检无截断 |

## 📁 文件结构

```
experiment-report-skill/
├── README.md                             ← 说明文档（本文件）
├── SKILL.md                              ← 主技能文件（工作流 + docx 交付规范）
└── references/
    ├── checklist.md                      ← 交付检查清单
    ├── math-formulas.md                  ← LaTeX → OMML 公式映射参考
    └── templates/
        ├── report_template.md            ← 实验报告（md）模板
        └── report_template_docx.js       ← 实验报告（docx）生成器模板 ⭐
```

`report_template_docx.js` 是开箱即用的 Node 生成器：封装好了宋体五号 helper、活序号 numbering、OMML 公式构造、封面、自动目录，产出 docx 时直接改 CONTENT 段即可，不用从零踩字体/序号的坑。

## 📦 环境依赖

- 任何支持 Skill 的 AI 工具（ZCode / Claude Code / Codex / Cursor / Gemini CLI 等）
- 产出 docx 需要：**Node ≥ 18** + `docx` 库（`npm install docx image-size`）
- 产出截图需要：Playwright（或本机 Edge/Chromium）

## 📄 报告模板结构（十章）

1. 实验名称　2. 实验目的　3. 实验环境与任务定义　4. 算法/方法原理
5. 实验实现　6. 实验结果　7. 结果分析　8. 实验结论　9. 心得感悟　10. 附录

## 🎯 适用场景

- 强化学习实验报告（SARSA / Q-learning / DQN 等）
- 机器学习算法对比实验
- 多模态 / 深度学习实验
- 数据分析报告
- 任何需要"跑实验 + 展示结果 + 写规范报告"的作业

## 🤝 贡献

欢迎提交 Issue 和 PR！

- 如果你用了这个 Skill 完成了某个实验报告，欢迎分享你的体验
- 如果你有改进建议，直接提 PR

## 📜 License

MIT License
