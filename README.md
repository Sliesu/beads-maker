# 豆叽

照片进来，变成能拼的图纸。

在线用：[https://sliesu.github.io/beads-maker](https://sliesu.github.io/beads-maker)

选一张图，裁好，对上豆子色号，就可以在画布上改格子，再导出图纸和采购清单。图纸在浏览器里算，历史记录也留在这台设备上。

## 怎么用

1. 从相册选图，裁切，需要的话先去掉纯色背景。
2. 选豆子品牌和格子大小，生成图纸。
3. 在画布上查看、改色、换色。点「显示」可以给图纸起名字，并开关格子线、坐标轴、色号和分区线。
4. 导出图纸 SVG，或导出采购清单。
5. 首页的历史记录可以接着改以前的图纸。

支持的色卡：MARD（221 / 291）、COCO、漫漫、盼盼、咪小窝。

屏幕上的颜色和实物豆子会有一点差别。

## 本地运行

```bash
npm install
npm run dev
```

打开 [http://127.0.0.1:5173](http://127.0.0.1:5173)。

线上版本没有 AI。本机不配钥匙也可以选图、对色、改格子、导出。AI 改图只在本地打开，见下面。

## AI 改图

只有在准备页点了 AI 风格，图片才会上传。接口在 `server/index.mjs`，钥匙放在本机 `.env`，不要提交到仓库。

```bash
cp .env.example .env
```

需要：

- `KIE_API_KEY`：改图
- 腾讯云 COS：`COS_SECRET_ID`、`COS_SECRET_KEY`、`COS_BUCKET`、`COS_REGION`

页面和接口不在同一个域名时，再加上 `APP_ORIGINS`。正式环境默认每个 IP 每小时 8 次、每天 24 次。

```bash
npm start
```

这会用生产模式起接口，并托管 `dist`。推到 GitHub Pages 的构建会关掉 AI（`VITE_AI=0`），线上没有风格化。

## 部署

推到 `main` 后，GitHub Actions 会构建并发布到 GitHub Pages。构建时使用站点前缀 `/beads-maker/`。
