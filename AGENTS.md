# AGENTS.md

本仓库根目录就是 DeepSeek Harness（DSH）插件 `dsh-provider`。设置页标题是「模型配置」。

`temp/` 是本地临时工作区，已写进 `.gitignore`，不要提交，也不要在里面放要交付的源码。对照树、设计稿和隔离的 DSH 安装可以留在 `temp/`。

## 语言：只用 TypeScript

手写源码全部使用 TypeScript。禁止新增或手改 `.js`、`.mjs`、`.cjs`、`.jsx`。

| 路径 | 规则 |
| --- | --- |
| `src/**/*.ts` | 唯一的手写源码 |
| `test/**/*.ts` | 唯一的手写测试。用 `tsx` 或 Node 的 TypeScript 剥离运行 |
| `dist/**/*.js` | `tsc` 或打包器的产物。禁止手改。`package.json` 的 `main` 和 `./client` 指向这里 |
| `lib/**/*.js`、`test/**/*.mjs` | 旧实现。要改时先迁到 `src/` 或 `test/` 的 `.ts`，接线通过后删除旧文件。不要在旧文件上打补丁 |
| `*.json`、`*.yml`、`*.md` | 数据、补丁和文档，可以保留 |

依赖用 pnpm 管理（`packageManager` 为 `pnpm@12.3.4`）。不要再生成 `package-lock.json`。

DSH 宿主加载的是编译后的 JavaScript。发布、安装和联调前必须先 `pnpm run build`。编译产物不是手写 JavaScript 的许可。

同一模块不要留下 TypeScript 和手写 JavaScript 两份实现。浏览器设置页最终也是一份 TypeScript，打包成单个 `dist/client.js`。这个文件继续使用 `window.__ModuleLoader__.load` 和 `require("react")`，不要在浏览器包里静态 `import` React。

相对导入使用 NodeNext 风格的 `.js` 后缀，即使源文件是 `.ts`。

新文件按 `strict` 编写。迁移尚未收紧的旧模块时，不要用 `@ts-nocheck` 或 `any` 把新代码的类型检查关掉。

## 运行时边界

- 只做 DSH 插件。不重写 oh-my-pi，不另做 harness，不要求用户安装 omp。
- 插件拥有协议和登录。登录方式要齐：API Key、OAuth、设备码、订阅、本机 CLI、本地引擎。没有公开登录的厂商不要编造 OAuth。
- 宿主只看见本插件登记的模型。密钥留在插件目录。请求经回环网关转发。管理路由只接受 loopback。
- 一个档案对应一条宿主模型登记，`baseURL` 指向本插件回环。检测到 `llm-pi-ai` 就写它，否则走 `dsh-llm` 适配器。不要双写，也不要维护两份目录。
- 处置时只删除本插件拥有的档案（用回环 `baseURL` 识别）。
- 用量、压缩和图片对所有供应商通用。Factory 是官方登录里的一张卡，不是单独的设置页。
- 网页和桌面能力相同。本地引擎、设备码和回环回调发生在运行 DSH 进程的那台机器上。界面不要写「仅桌面」。
- 连通性测试默认不发送付费对话。没有真实协议探测时，协议步骤报告跳过，不要报成成功。本地引擎只做连通检查。没有额度接口时不要画假余额。

## 目录与界面

- 一个供应商一行一张卡片，列表向下滚动。不要恢复按高度分页的官方登录网格。
- 筛选只有：全部、官方平台、API Key、本地、检索。默认展示官方平台，它排在 API Key 前面。没有国家分组，没有「服务区域」字段。厂商自己的不同产品 id（例如 SiliconFlow 与 SiliconFlow CN）各占一行。
- 界面语言可以翻译。`zh` 和 `en` 词典都要覆盖每一个 `t("key")`。供应商名单不随语言变化。
- 主列表只显示已启用或已登录的档案。完整目录在添加对话框里搜索。
- 检索供应商挂到对话上做搜索，不登记成聊天模型。compat 规则不是供应商。
- 设置导航是：模型配置、用量、诊断。设计稿里的「功能对照」不发给用户。

## 对照材料（只读，不进 Git）

下面这些路径如果出现在本机 `temp/` 里，只作对照。运行时不读取，也不要改，更不要加进版本库：

- `temp/oh-my-pi`：手工移植 provider / auth 清单。差异写在诊断或发版说明里。不用 submodule，不实时跟踪。
- `temp/cc-haha`：模型配置的行卡片、编辑表和两段测试的界面效果。
- `temp/dsh-provider-settings-design.html`、`temp/dsh-provider-architecture.md`：界面和架构合同。架构文档里若仍写「确认前不改」或「服务区域」，以本文件为准。

## 测试隔离

验收测试在 `tests/`。要求与用例的对应关系写在 `tests/README.md`，合同常量在 `tests/support/contract.ts`。每次宿主测试新建空的临时 `DSH_HOME`，不复用 `temp/dsh-test-home`。子进程清掉继承的 `DSH_HOME` 和 `DSH_PROVIDER_*`。DSH 命令使用 `temp/dsh-test-prefix` 里的 `0.2.2-rc.5` 或 `DSH_TEST_BIN`。不要升级或覆盖用户全局安装的 `dsh`，不要写入用户真实的 `~/.dsh`。凭证测试使用 `DSH_PROVIDER_ACCOUNTS_DIR` 指向临时目录。`test/` 只保留原 Factory 网关套件。
