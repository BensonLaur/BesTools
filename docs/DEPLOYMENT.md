# GitHub Pages 发布与维护

## 发布状态与边界

首版已于 2026-10-13 下班后完成提交、公开仓库创建与 GitHub Pages 部署，BesSoftware 的工具入口也已发布。仓库描述、topics 和 Website 已设置，两个站点均通过线上验证。

后续修改在本地准备并核对摘要，提交、推送与部署按用户当次授权执行，不自动定时执行。提交使用运行时的真实时间，不设置 `GIT_AUTHOR_DATE` 或 `GIT_COMMITTER_DATE`。

公开仓库：[BensonLaur/BesTools](https://github.com/BensonLaur/BesTools)；Website 为 [工具箱](https://bensonlaur.github.io/BesTools/)，密码工具为 [随机密码生成器](https://bensonlaur.github.io/BesTools/tools/password/)，作品入口位于 [BesSoftware](https://bensonlaur.github.io/BesSoftware/)。实际 Website 以 Pages API 返回地址为准。描述、topics 和发布脚本所用的提交标题正文保存在 `github.json`。

## 一键流程

1. 检查 `.local/publish-context.json` 中准备文件摘要、当前 HEAD、分支和 origin，拒绝混入之后的文件变动。文本检查纯 CRLF；标记为 `binary` 的收款原图只检查字节摘要。
2. 重新运行 BesTools 与 BesSoftware 验证。
3. 阅读各自 AGENTS.md 和近期日志，从来源会话重新读取实际模型；追加规范的 AI 署名并创建 BesTools 初始提交。
4. `gh repo create BensonLaur/BesTools --public --description ... --homepage ... --source ... --remote origin`，不在创建时自动生成 README 或第二条历史。
5. 设置仓库描述和 topics，推送 main；通过 Pages API 将发布方式设为 GitHub Actions。
6. 显式触发 `pages.yml` 并等待成功。首次 push 可能在启用 Pages 前触发，显式触发保证使用已完成的配置。
7. 检查首页与密码工具 HTTP 响应，把实际 Pages 地址填入 GitHub 仓库 About → Website。
8. 工具上线后创建 BesSoftware 的独立提交、推送并等待其 Pages 工作流。

过程中每个成功的本地提交写入不提交的 `.local/publish-state.json`，再次运行会复用这些提交。首次发布后，已有仓库与 Pages 配置会被复用。没有强制推送、回滚或删除远程仓库。网络或工作流失败时，已经创建的真实提交仍保留。

## 手动维护参考

```powershell
gh repo edit BensonLaur/BesTools --description "BesTools · 个人顺手工具集。把常用的小事，做得顺手一点。安全随机密码生成，在浏览器本地运行，免费、无广告。" --homepage "https://bensonlaur.github.io/BesTools/"
gh api --method POST repos/BensonLaur/BesTools/pages -f build_type=workflow
gh workflow run pages.yml --repo BensonLaur/BesTools --ref main
gh run list --repo BensonLaur/BesTools --workflow pages.yml
```

Pages 已启用时不要重复 POST；需更新现有配置时使用 PUT。也可在 Settings → Pages → Source 选择 GitHub Actions。

## 发布内容与地址

工作流在 Node.js 22 上执行无依赖的密码逻辑验证和静态构建，只上传 `dist/`。开发脚本、发布上下文、测试结果和文档不进入 Pages。网站是多页面结构，每个工具都有真实目录，不依赖 SPA 路由回退。

本地模拟：`npm run dev -- --base /BesTools/`，访问 `http://127.0.0.1:4175/BesTools/tools/password/`。

## 准备文件变化时

若继续修改代码或已由其他方式创建提交，脚本会因摘要或 HEAD 不匹配停止。先完成必要验证，再让 Codex 重新准备发布上下文；不要删除校验来强行发布。

来源会话读取失败时停止，不用默认配置代替实际模型。若新克隆缺少 `.local/`，可按 AGENTS.md 手动提交发布，或重新准备本机一键流程。
