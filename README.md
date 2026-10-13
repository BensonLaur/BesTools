# BesTools · 个人顺手工具集

**把常用的小事，做得顺手一点。**

Benson 的个人工具箱，独立于 [BesSoftware](https://github.com/BensonLaur/BesSoftware) 维护。第一项工具是随机密码生成器：打开即用、免费、无广告、无需登录。更多工具按真实需要逐步加入。

在线使用：[工具箱](https://bensonlaur.github.io/BesTools/) · [随机密码](https://bensonlaur.github.io/BesTools/tools/password/)。首版已于 2026-10-13 发布到 GitHub Pages，并加入 BesSoftware 作品入口。

## 本地使用

需要 Node.js 22 或更新版本。运行与构建仅使用内置模块，无需安装依赖：

```powershell
cd D:\Projects\Benson\BesTools
npm run dev
```

打开 `http://127.0.0.1:4175/`，密码工具地址为 `http://127.0.0.1:4175/tools/password/`。按 Ctrl+C 停止预览。ES Modules 需要 HTTP/HTTPS，请使用预览服务器。

## 第一个工具

- 默认 16 位，可快速选择 10、16、24、32 位，支持 4–128 位长度。
- 可选择数字、大写、小写、符号，每个密码覆盖所选的每一类字符。
- 默认排除 `0 O o 1 I l`，可额外排除字符。
- 每次生成 1–100 个，支持逐条复制与全部复制。
- 浏览器 Web Crypto 安全随机源，整数拒绝采样消除取模偏差；整串均匀生成后筛选类别覆盖。批量结果各自独立生成，不承诺互不重复。
- 缺少安全随机源时停止，不降级到普通随机数；非法或耗时过长的规则清晰报错，不返回部分结果。
- 修改规则时清空旧结果，刷新与页面离开时清除密码，避免从浏览器前进后退缓存恢复旧密码。
- 记住设置使用明确白名单，不保存密码；可以关闭偏好保存或恢复默认。禁用本地存储不影响生成。
- 深浅色跟随系统，支持键盘和 320px 窄屏。

密码计算、字符规则和复制在当前浏览器执行，没有运行时外部依赖。生成结果不上传、不写入网址、不自动复制、不进入本地历史。需要长期保留的密码请放入密码管理器。

## 自愿支持

首页的「让顺手的小工具，慢慢多起来」邀请卡片，以及工具页底部的「给工具箱添点心意」入口，共用一个支持面板。它只在主动点击时打开，不在生成或复制后自动出现；打开、切换和关闭面板保留当前密码与设置。

工具箱开合与暖光只回应面板状态。金额由使用者决定，所有工具免费、无广告，使用、分享和反馈也都是支持。微信与支付宝收款原图完整展示，提供保存原图、相册识别说明和收款人信息；支持键盘焦点循环、Esc、关闭后焦点返回和减少动态效果。

收款图片原样复用自 BesSoftware，不建立订单、不检测付款，也不根据打赏改变功能。图片来源、摘要与验证边界见 [支持入口说明](docs/SUPPORT.md)。

## 验证和构建

```powershell
npm ci
npm test
npm run build
```

Windows 默认使用已安装的 Edge。其他环境执行 `npx playwright install chromium`，然后设置空的 `BES_BROWSER_CHANNEL`，或指定已安装的 `chrome`。

`npm run test:unit` 验证随机分布实现、类别覆盖、长度与排除边界、持久化白名单。`npm run test:browser` 验证真实浏览器的生成、批量、复制、重载、存储限制、无安全随机源、深浅色、键盘、窄屏与 `/BesTools/` 项目路径，以及支持入口、原图下载、快速开合和工具状态保留。

构建只复制 `index.html`、`tools/`、`assets/` 与 `.nojekyll` 到 `dist/`。文档、脚本、开发依赖与本地发布上下文均不进入网站。

## 维护与发布

首版的公开仓库、描述、topics、Website 与两个站点的部署已完成。后续修改先完成本地验证并更新准备摘要，再按当次授权提交和发布。只读检查：

```powershell
npm run publish:plan
```

需要发布已核对的改动时，在当前电脑双击 `publish.cmd`，或执行：

```powershell
npm run publish:github
```

脚本核对准备文件与 Git 状态、重新测试，使用真实执行时间创建提交，然后创建公开仓库、设置描述与 topics、推送、启用 GitHub Pages、等待部署，并把实际 Pages 地址补到仓库 Website。工具上线验证后，才提交和发布 BesSoftware 的入口。

只创建本地提交可运行 `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/publish.ps1 -CommitOnly`。之后运行完整发布命令可继续。

脚本拒绝之后混入的改动、变化的 HEAD 或时间覆盖环境变量；失败后不强推，可检查错误并重跑。来源会话和文件摘要保存在不提交的 `.local/`，当前电脑的一键流程需要保留该目录。详见 [发布说明](docs/DEPLOYMENT.md)。

## 增加工具

在 `tools/<工具名>/` 中添加独立页面与脚本，在首页登记入口。计算逻辑与界面分开，资源使用相对路径，以便 GitHub Pages 子路径和直接刷新正常工作。

近期按实际需求考虑 UUID、时间戳转换、JSON 格式化、文本去重和二维码。离线缓存与安装到桌面作为后续迭代，当前需要网络加载网站。

本站自编代码和文档采用 [MIT License](LICENSE)。Bes 名称、品牌内容与收款图片的归属及使用边界见 [内容与素材边界](docs/RIGHTS.md)，不随代码许可证转移。Playwright 仅用于开发验证，遵循其自身许可，不随网站发布。
