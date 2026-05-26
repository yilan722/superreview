# Trade Review — Candle by Candle

在 K 线截图上拖放 Al Brooks 式标注对象，并写复盘笔记（参考 [Write on Charts](https://www.youtube.com/watch?v=AGyOld9iY8U)）。

## 使用

```bash
npm install
npm run dev
```

浏览器打开终端里显示的地址（一般是 http://localhost:5173）。

1. **上传 / 粘贴 / 拖放** K 线截图到中间画布  
2. 从**右侧工具栏**把标签、色块、水平线、箭头拖到图上  
3. 在**左侧**写整体复盘；选中某个标注后可在「选中对象的备注」里写说明  
4. **导出 PNG** 保存带标注的图  

数据会自动保存在浏览器 `localStorage`。

## 实时 K 线 · 阿布百科 OHLC 匹配

顶部 **实时 K 线** 使用 [FMP](https://financialmodelingprep.com/) 拉取行情，在面板内用 **真实 OHLC** 做阿布式四段叙事匹配（开盘结构 / V 反转 / 牛熊腿 / TR·LH），对照《阿布图表百科全书》slide。

`.env` 中配置 `VITE_FMP_API_KEY`（见 `.env.example`）。

### 一次性建立百科索引（本机执行）

需要已安装 [Poppler](https://poppler.freedesktop.org/)（`pdftoppm`、`pdfinfo`）和 Python 3：

```bash
pip install -r scripts/encyclopedia/requirements.txt
export ENCYCLOPEDIA_PDF="/path/to/阿布图表百科全书.pdf"

# 页码索引 + 缩略图（约 9027 页，支持 --resume）
npm run encyclopedia:build

# 数值结构索引（knowledge.json，纯 OHLC/shape，运行时匹配用）
npm run encyclopedia:learn
```

索引输出在 `public/encyclopedia-data/`（体积大，已 `.gitignore`）。

### 部署到 Vercel Blob（推荐，访问者无需本地 build）

只需**你**在本机构建一次，再上传到 [Vercel Blob](https://vercel.com/docs/storage/vercel-blob)：

1. Vercel 控制台 → **Storage** → **Blob** → Create → 复制 **Read/Write Token**
2. 本机已跑完 `encyclopedia:build` + `encyclopedia:learn` 后：

```bash
export BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...
npm run encyclopedia:upload-blob
# 断点续传：npm run encyclopedia:upload-blob -- --resume
# 仅 JSON：npm run encyclopedia:upload-blob -- --json-only
```

3. 脚本结束会打印 `VITE_ENCYCLOPEDIA_BASE_URL=...`，填入：
   - 本机 `.env`
   - Vercel Project → **Settings → Environment Variables**（Production / Preview）
4. 重新部署 Vercel。线上会从 Blob CDN 拉 `knowledge.json` 与 slide 图片。

未配置 `VITE_ENCYCLOPEDIA_BASE_URL` 时，仍从本地 `public/encyclopedia-data/` 读取（适合纯本机开发）。

## 快捷键

- `Delete` / `Backspace`：删除选中的标注（焦点不在输入框时）
- 双击文字标签：编辑文字
