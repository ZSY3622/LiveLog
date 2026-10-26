# HLS.js 1.7.3

来自 [video-dev/hls.js](https://github.com/video-dev/hls.js/tree/v1.7.3) 的固定版本官方 npm 发布包，使用 Apache-2.0 许可证。`hls.min.js` 与 `LICENSE` 均原样保存；网站运行时不通过 CDN 获取播放器代码。

- 发布包：`https://registry.npmjs.org/hls.js/-/hls.js-1.7.3.tgz`
- npm 完整性校验：`sha512-MsPlx6yVW4Qv4C7mEVou4/gk/5cN2dVxOTnrNjPSmyH2f0Ln+/UkG10Ax1PE6OvrmTVPKgQYozTtBaPOuCzq7A==`
- `hls.min.js` SHA-256：`a12e7ee1cd64a69dcdb314157e45dafcba705bfb0b1440b7935cb265d374423e`

Chrome 等浏览器通过此脚本播放 HLS；Safari 优先原生播放。本地 `file://` 页面禁用 HLS.js Worker，避免本地 Worker URL 的加载限制；不关闭浏览器的同源或证书保护。

专辑的图片、HLS 播放列表和视频分片由远端提供，需联网。此目录不保存专辑视频或封面素材。
