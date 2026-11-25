# dsh-provider

[English](README.en.md)

DeepSeek Harness（DSH）的模型供应商插件。安装名是 `dsh-provider`。设置页标题是「模型配置」。

这是社区插件，与 DeepSeek 及各模型厂商无官方隶属关系。源码仓库是 [Lyong2024/dsh-provider](https://github.com/Lyong2024/dsh-provider)。

## 这个测试版能做什么

打开 **设置 → 模型配置**。一个供应商一行。列表只显示已保存的档案。点「添加模型」可以搜索完整目录。

- **API Key**：保存名称、接口地址、API 格式、认证方式和密钥。列表和保存结果只返回是否已有密钥，不回传密钥本身。
- **本地**：Ollama、LM Studio、llama.cpp、vLLM 等本机引擎。本地档案不保存密钥。
- **官方登录**：点「登录」后，这一行显示该供应商公布的授权链接。页面不会自动打开它。点链接才进入授权。只支持 API Key 的供应商会打开官方控制台；没有公开登录、或已暂停的项会显示原因，不会编造链接。
- **检索**：检索供应商挂到对话上做搜索，不登记成聊天模型。添加对话框里不能把检索项保存成档案。
- **测试**：连通检查访问接口地址，不附带密钥，也不发送付费对话。协议步骤显示「跳过」。

筛选只有：全部、官方平台、API Key、本地、检索。打开页面时先显示官方平台。界面语言可以切换。供应商名单不随语言变化。

密钥、档案和官方登录授权写在运行 DSH 的那台机器上，默认目录是 `~/.dsh-provider/`（`accounts/`、`profiles/`、`token-usage/`、`logins/`）。管理接口只接受本机回环访问。状态接口不返回授权内容。

## 这个测试版还没有做的事

- 把官方登录或新保存的档案登记进宿主的模型选择器。设备码和回环回调可以在后台保存授权，模型列表仍不会出现这项。
- 导入 JSON。导入按钮只显示后续版本的说明。
- 用量页、诊断页，以及按档案显示的额度条。

旧的订阅网关仍会向宿主登记自己的路由，显示名是平台名：OpenAI、Claude、Google、Grok、Muse、Core。它们和「模型配置」里新保存的档案是两套数据。

## 环境

- Node.js 20 或更新版本
- 已安装的 DSH。开发与验收使用的宿主是 `@deepseek-ai/dsh@0.2.2-rc.5`
- pnpm 12.3.4。仓库用 `packageManager` 固定这个版本

DSH 提供 peer 依赖 `@deepseek-ai/schemastery`。

## 安装

请安装 Release 里的 `.tgz`。GitHub 自动附带的源码包没有 `dist/`，DSH 无法加载。

当前版本 `1.4.2` 对应的安装命令是：

```sh
dsh plugin --profile web add https://github.com/Lyong2024/dsh-provider/releases/download/v1.4.2/dsh-provider-1.4.2.tgz
```

把版本号换成你要测的那一次 Release。同一份字节也有不带版本号的 `dsh-provider.tgz`，并附 `SHA256SUMS.txt`。

安装或更新后完全退出并重新打开 DSH。只刷新页面仍会使用上一份客户端脚本。

从本机源码安装时，先构建再添加。Windows 上的路径使用正斜杠：

```sh
pnpm install
pnpm run build
dsh plugin --profile web add "file:C:/path/to/dsh-provider"
```

移除：

```sh
dsh plugin --profile web remove dsh-provider
```

## 开发

```sh
pnpm install
pnpm run build
pnpm run typecheck
pnpm test
pnpm run test:matrix
```

`pnpm run build` 编译 `src/` 到 `dist/`，并复制目录和路由用的 JSON。`dist/client.js` 必须是经典脚本，由 `window.__ModuleLoader__.load` 注册 `dsh-provider`。

`pnpm test` 跑 `test/` 里的旧网关套件。`pnpm run test:matrix` 跑 `tests/` 里的目录、档案、路由和文案合同，不启动 DSH，也不访问外网。`pnpm run test:host`、`pnpm run test:stability` 和 `pnpm run test:acceptance` 会启动隔离的 DSH。这些测试每次新建一个空的临时 `DSH_HOME`，不复用 `temp/dsh-test-home`，也不写入用户自己的 `~/.dsh`。

手写源码在 `src/**/*.ts`。不要手改 `dist/` 或 `lib/**/*.js`。

## 发布测试包

1. 修改 `package.json` 的 `version`。
2. 提交这次变更。
3. 把与版本号一致的 tag 推到 [Lyong2024/dsh-provider](https://github.com/Lyong2024/dsh-provider)。版本 `1.4.2` 对应 tag `v1.4.2`。

```sh
git tag v1.4.2
git push https://github.com/Lyong2024/dsh-provider.git v1.4.2
```

`.github/workflows/release.yml` 会在该 tag 上安装依赖、构建、测试、打包，并把下面三个文件上传到 GitHub Release：

- `dsh-provider-1.4.2.tgz`
- `dsh-provider.tgz`
- `SHA256SUMS.txt`

工作流不会修改 `awesome-dsh-plugin` 目录，也不会发布到 npm。市场条目要等这次安装验证通过后，再单独提交一个 PR，把 `tarball` 钉在这次 tag 的地址上。

## 许可

[MIT](LICENSE)。历史版本说明见 [CHANGELOG.md](CHANGELOG.md)。
