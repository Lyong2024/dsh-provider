# 标准化测试

本目录是 `dsh-provider` 的验收测试。可执行合同在 `tests/support/contract.ts`。本文与该文件、以及下面列出的测试文件必须一致：`tests/readme-sync.test.ts` 会核对功能 id、必需供应商 id、排除 id、插件版本和种子。

`test/` 是原 Factory 网关的旧套件。本目录不替换它，也不把未实现的登录写成通过。

## 干净环境

每次宿主测试都新建一个空的临时目录作为 `DSH_HOME`，用完即删。不复用 `temp/dsh-test-home`。启动前清掉从父进程继承的 `DSH_HOME` 和 `DSH_PROVIDER_*`，档案、账号、登录授权和用量都落在这次的临时目录里。测试开始前记录用户目录 `~/.dsh` 的存在性和修改时间，结束后必须相同。代码拒绝把 `DSH_HOME` 指到 `~/.dsh`。

DSH 命令使用本机隔离前缀 `temp/dsh-test-prefix` 里的 `dsh.cmd`，或环境变量 `DSH_TEST_BIN`。版本必须是 `0.2.2-rc.5`。禁止使用全局 npm 里的 `dsh`。`temp/` 不进 Git。档案和账号分别放到另外两个临时目录：`DSH_PROVIDER_PROFILES_DIR`、`DSH_PROVIDER_ACCOUNTS_DIR`。

不向供应商发送付费对话。连通性打到测试自己启动的 `127.0.0.1` 端口。请求不带 `Authorization`，不带 `x-api-key`，正文为空。协议步骤跳过：`protocol.ok === false` 且 `protocol.skipped === true`。不把跳过报成成功。

## 全量供应商

目录文件是 `lib/provider-catalog.json`，由 `loadCatalog()` 读取。测试不写死总条数，只要求：

- id 不重复，名称按 `localeCompare` 排序。
- `kind` 只有 `api`、`login`、`local`、`search`。
- `api` 只有 `anthropic-messages`、`openai-completions`、`openai-responses`、`google-generative-ai`。
- 对象上没有 `country` 或 `region` 字段。地址模板里的 `{region}`（例如 Bedrock）不算国家分组。

必须存在：

- 本地：`ollama`、`ollama-cloud`、`lm-studio`、`llama.cpp`、`vllm`、`apple`、`local`。kind 为 `local`。
- 检索：`web`、`exa`、`tavily`、`perplexity`、`kagi`、`parallel`。kind 为 `search`。
- 补齐的 API：`dashscope`、`volcengine-ark`、`hunyuan`、`spark`、`sensenova`、`lingyi`、`huawei-maas`、`modelscope`、`baichuan`、`infiniai`、`skywork`、`zhinao360`。kind 为 `api`。
- 官方登录样例：`anthropic`、`openai-codex`、`factory-droid`、`google`、`xai-oauth`、`github-copilot`。kind 为 `login`。

必须不存在（它们是 compat 规则，不是供应商）：`native-tools`、`image-tokenization`、`yolo-auto`。

## 功能矩阵

`tests/provider-matrix.test.ts` 对目录里的每一个 id 执行同一组检查。预设地址为空时，档案的 `baseUrl` 使用本地探测服务，避免打到外网。

| id | 断言 |
| --- | --- |
| `shape` | id、name、kind、api 齐全 |
| `no-geo` | 序列化结果没有 country / region |
| `wire` | api 属于四种协议之一 |
| `profile-kind` | `api` / `local` / `search` 可以保存；`presetId` 等于目录 id |
| `secret-mask` | 返回值和列表 JSON 不含密钥明文；`readSecret` 才能读到 |
| `local-dummy` | 本地档案强制 `auth = dummy`，密钥不落盘 |
| `search-not-chat` | `registersAsChatModel("search") === false`。检索可以保存，不登记成聊天模型 |
| `login-not-stored` | `kind: "login"` 保存会抛 `invalid kind`。官方登录只留在目录里 |
| `probe-no-credential` | 探测请求没有认证头，正文为空 |
| `protocol-skipped` | 协议步骤为跳过，不是成功 |
| `single-default` | 两次 `setDefault` 之后全库只有一个默认档案 |
| `delete-secret` | 删除后密钥文件消失，列表不再包含该 id |

`tests/routes.test.ts` 用同一合同打回环路由：非 loopback 的目录请求返回 403；loopback 的 `GET /api/dsh-provider/catalog` 条数等于 `loadCatalog()`；保存响应不含密钥；`action: "test"` 走探测并跳过协议；`login` 保存返回 400。

`tests/client-contract.test.ts` 核对 `src/client.ts`：`zh` 与 `en` 键一致；导航是「模型配置」/ `Model config`；说明写明不按国家分；登录文案声明页面本身不会打开外部授权，链接由用户点击；检索文案声明不伪装成聊天模型；协议文案是「跳过」/ `skipped`。源码不得出现 `服务区域`、`国内主流`、`仅桌面`、`desktop only`、`window.open`、`oauth`。样式使用 DSH 的 `--dsw-alias-*` 变量，不写设计稿米色。设置节 id 仍是 `dsh-provider`。卡片类名是 `mcp-card`，默认项加 `is-default`。文件保持经典脚本，没有顶层 `import` / `export`。

`tests/official-login.test.ts` 核对每个 `kind: "login"` 目录项：要么是 `https` 授权或控制台链接，要么是可见失败原因，要么要等供应商返回设备码链接。测试不访问供应商，也不把未完成的授权记为成功。

当前没有实现、因此本套测试不将其记为通过的能力：把官方登录或新档案登记进宿主模型选择器；付费对话；伪造额度条。Factory 旧网关仍由 `test/` 覆盖。

## 干净宿主

`tests/clean-host.test.ts`：

1. 新建空的 `DSH_HOME`，执行 `dsh --profile web --dump-default-config`。
2. `dsh plugin --profile web add file:<仓库根>`。
3. `package.json` 的 dependencies 含 `dsh-provider`，bundles 也含它。
4. `dsh --profile web --port <空闲端口> --no-open`。日志里不能出现该插件 `failed to import`。
5. 用启动日志里的令牌请求 `GET /?token=...`（不跟随重定向），拿走浏览器会话 Cookie。`/connect` 发的是 API Peer Cookie，不能给普通 HTTP 路由用。Query 上的令牌也不能直接调用插件路由，那样会得到 401。
6. 带浏览器 Cookie 的 `GET /api/dsh-provider/catalog` 返回 200，`value.length` 等于目录条数。再带 Cookie 请求 `/`，返回 200。
7. 停掉进程树，删除临时目录，并确认 `~/.dsh` 未被写入。

## 稳定性

池子大于 10，写在 `MAINSTREAM_PLUGINS`。默认种子 `20261124`，可用 `DSH_TEST_PLUGIN_SEED` 换成别的整数。`shuffle` 必须对同一种子得到同一顺序。

测试取洗牌后的前 `10` 个，在另一套全新 `DSH_HOME` 里先安装本插件，再安装这 10 个，然后启动 web。本插件仍须能返回完整目录，且日志没有 `failed to import`。`~/.dsh` 仍不得被写入。

固定候选（名称与版本都要安装到这个版本）：

- `dsh-pet@0.4.9`
- `dsh-context@0.87.1`
- `dsh-whale-widget@0.4.2`
- `dsh-cost-meter@1.9.87`
- `dsh-m@0.12.24`
- `dshmarket@1.81.0`
- `dsh-config-manager@0.12.0`
- `dsh-prompt-setting@0.3.0`
- `dsh-settings-nav-organizer@1.7.3`
- `dsh-llm-retry-settings@0.1.19`
- `dsh-easyrewrite@3.1.0`
- `@objectivex666/dsh-settings-search@1.14.1`
- `@linxin666/dsh-usage@0.4.21`
- `dsh-remember@0.3.2`
- `@nonamelego/dsh-catppuccin@0.7.5`
- `dsh-any-background@0.5.0`

这些是带 `dsh-plugin` 关键词的社区插件，不是 web profile 自带的 `@deepseek-ai/dsh-base` 或 `@deepseek-ai/dsh-web-app`。

## 命令

在仓库根目录：

依赖管理是 pnpm。在仓库根目录：

```sh
pnpm run test:matrix
pnpm run test:host
pnpm run test:stability
pnpm run test:acceptance
pnpm test
```

`pnpm test` 跑 `test/` 里的原 Factory 套件。`test:matrix` 不启动 DSH，也不访问外网。`test:host` 和 `test:stability` 会先 `pnpm run build`。`test:acceptance` 按顺序跑本目录全部测试。矩阵文件内部对每个供应商串行，避免档案目录环境变量互相覆盖。

失败时看供应商 id 或插件规格。稳定性失败信息里带种子，便于用同一个 `DSH_TEST_PLUGIN_SEED` 重跑。
