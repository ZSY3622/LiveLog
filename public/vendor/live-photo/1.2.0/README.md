# thun888/LivePhoto 1.2.0

来源：[thun888/LivePhoto](https://github.com/thun888/LivePhoto)，官方 npm 包 `@thun888/live-photo@1.2.0`，MIT 许可见同目录 `LICENSE`。

原始发布包 SHA-1：`856e7c7c5c08781800970ff9eb512aff27fa2efc`。

`bundle.js`、`931.bundle.js`、`main.css` 来自官方发布包，必须一起部署。`931.bundle.js` 是按需加载的 HEIC 解码分块，路径由主脚本所在目录决定，支持 GitHub Pages 的项目子路径。

唯一的发布包补丁是在 `bundle.js` 的导出表增加 `Player`，导出上游 `init()` 已使用的播放器类。这样项目适配器可以保存实例，在关闭弹窗、切换照片时停止视频、断开观察器并释放 Blob URL。渲染、HEIC 解码、原始视频播放和声音控制均使用上游实现。

仓库根目录的 `live-photo.js` 是适配层，负责生命周期、键盘操作、减少动态效果偏好和仅展示缩略图的模式。

重新获取并保存相同版本：

```sh
npm pack @thun888/live-photo@1.2.0 --ignore-scripts
python3 scripts/vendor-live-photo.py thun888-live-photo-1.2.0.tgz
```

脚本会核对发布包哈希和导出结构；更换上游版本时应人工检查适配器兼容性。网站运行无需安装 npm 依赖或连接 CDN。
