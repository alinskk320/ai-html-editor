# AI HTML Editor

中文 | [English](#english)

## 中文

🚀 **这是一个可自托管的 HTML 可视化编辑器。**

🤔 感觉 AI 生成的 HTML 不够完美，还要反复复制粘贴修改？
现在，你可以直接在编辑器中精准微调代码细节，还能通过自然语言与 AI 实时交互，一键修改组件样式。从生成到完美，一站式完成，最终一键导出你 100% 满意的 HTML 文件！✨

### 🛠️ 你可以用它做什么

- 📂 **上传现有 HTML**：直接导入页面进行可视化编辑
- 🎨 **精准微调细节**：直接修改组件的颜色、字体、间距等样式
- 🤖 **AI 对话式重构**：选中单个组件，让 AI 按你的要求继续修改
- 👀 **所见即所得**：一边预览一边反复调整，直到满意为止
- 📥 **一键导出成品**：最终导出修改后的完美 HTML 文件
<img width="1910" height="929" alt="image" src="https://github.com/user-attachments/assets/7214f42f-3d7d-4342-8ffe-93e5b5495fa1" />



### 部署方式


#### 本地运行

```bash
cd ai-html-editor
cp .env.example .env
npm run dev
```

启动后访问：

```text
http://localhost:6199
```

#### Docker 运行

```bash
docker build -t ai-html-editor .
docker run --rm -p 6199:6199 --env-file .env ai-html-editor
```

### AI 配置

默认建议把真实 API Key 放在服务端 `.env` 里。

前端页面里保留了：

- provider
- endpoint
- model


## English

🚀 A Self-Hosted Visual HTML Editor.
🤔 Is the AI-generated HTML not quite perfect, forcing you to copy and paste endlessly to fix it?
Now, you can precisely tweak code details right in the editor, and even use natural language to interact with the AI for one-click component styling. Go from initial generation to absolute perfection in one seamless workflow, and export your 100% perfect HTML file with a single click! ✨
🛠️ What You Can Do With It
📂 Upload Existing HTML: Import any web page directly for visual editing.
🎨 Tweak Details Precisely: Modify component colors, fonts, spacing, and more with ease.
🤖 AI-Powered Refactoring: Select any component and let the AI modify it based on your prompts.
👀 WYSIWYG Experience: Preview and adjust in real-time until it's absolutely perfect.
📥 One-Click Export: Instantly export your polished, final HTML file.

### Deployment


#### Run Locally

```bash
cd ai-html
cp .env.example .env
npm run dev
```

Then open:

```text
http://localhost:6199
```

#### Run with Docker

```bash
docker build -t ai-html-editor .
docker run --rm -p 6199:6199 --env-file .env ai-html-editor
```

### AI Configuration

It is recommended to keep real API keys in the server-side `.env`.

The frontend UI still lets users switch:

- provider
- endpoint
- model
