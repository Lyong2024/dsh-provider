# dsh-provider

[中文](README.md)

A model-provider plugin for DeepSeek Harness (DSH). The install name is `dsh-provider`. The settings title is "Model config".

This is a community plugin. It is not affiliated with DeepSeek or with the model vendors. The source repository is [Lyong2024/dsh-provider](https://github.com/Lyong2024/dsh-provider).

## What this test build does

Open **Settings → Model config**. Each provider is one row. The list shows saved profiles. **Add model** searches the full catalog.

- **API key**: save a name, base URL, API format, auth style, and secret. List and save responses report only whether a secret exists. They do not return the secret.
- **Local**: engines such as Ollama, LM Studio, llama.cpp, and vLLM. A local profile does not store a secret.
- **Official platforms**: Sign in shows that vendor's published authorization link on the row. The page does not open it. Opening the link starts the authorization. API-key vendors show the official console. A row with no published sign-in, or a paused one, shows the reason and does not invent a link.
- **Search**: a search provider attaches to a chat as search. It is not registered as a chat model. The add dialog does not save a search row as a profile.
- **Test**: the connectivity check requests the base URL without the secret and without a paid chat. The protocol step shows "skipped".

Filters are All, Official platforms, API key, Local, and Search. The page opens on Official platforms. The interface language can change. The provider list does not change with the locale.

Secrets, profiles, and official-login grants are stored on the machine that runs DSH. The default directory is `~/.dsh-provider/` (`accounts/`, `profiles/`, `token-usage/`, and `logins/`). Management routes accept loopback callers only. Status responses do not return the grant.

## What this test build does not do yet

- Registering a completed official login or a newly saved profile in the host model picker. Device and loopback grants can be stored in the background, and they still do not appear in the model list.
- JSON import. The import button only shows a later-version notice.
- Usage and diagnostics pages, and per-profile quota bars.

The older subscription gateway still registers its own routes with the host. Those labels are the platform names: OpenAI, Claude, Google, Grok, Muse, and Core. They are separate from the profiles saved in Model config.

## Requirements

- Node.js 20 or newer
- A DSH install. Development and acceptance use `@deepseek-ai/dsh@0.2.2-rc.5`
- pnpm 12.3.4, pinned by the `packageManager` field

DSH provides the peer dependency `@deepseek-ai/schemastery`.

## Install

Install the `.tgz` from a GitHub Release. The source archive GitHub attaches to a tag has no `dist/`, so DSH cannot load it.

For the current version `1.4.2`:

```sh
dsh plugin --profile web add https://github.com/Lyong2024/dsh-provider/releases/download/v1.4.2/dsh-provider-1.4.2.tgz
```

Replace the version with the Release you are testing. The same bytes are also published as `dsh-provider.tgz`, with `SHA256SUMS.txt`.

Quit and reopen DSH after installing or updating. Refreshing the page keeps the previous client script.

To install from a local checkout, build first. On Windows, use forward slashes in the path:

```sh
pnpm install
pnpm run build
dsh plugin --profile web add "file:C:/path/to/dsh-provider"
```

Remove:

```sh
dsh plugin --profile web remove dsh-provider
```

## Development

```sh
pnpm install
pnpm run build
pnpm run typecheck
pnpm test
pnpm run test:matrix
```

`pnpm run build` compiles `src/` to `dist/` and copies the catalog and routing JSON. `dist/client.js` must stay a classic script and register `dsh-provider` through `window.__ModuleLoader__.load`.

`pnpm test` runs the legacy gateway suite in `test/`. `pnpm run test:matrix` runs the catalog, profile, route, and copy contracts in `tests/` without booting DSH or calling the network. `pnpm run test:host`, `pnpm run test:stability`, and `pnpm run test:acceptance` boot an isolated DSH. Each of those tests creates an empty temporary `DSH_HOME`. They do not reuse `temp/dsh-test-home` and they do not write the user's `~/.dsh`.

Hand-written source lives in `src/**/*.ts`. Do not hand-edit `dist/` or `lib/**/*.js`.

## Publish a test package

1. Change `version` in `package.json`.
2. Commit that change.
3. Push the matching tag to [Lyong2024/dsh-provider](https://github.com/Lyong2024/dsh-provider). Version `1.4.2` uses tag `v1.4.2`.

```sh
git tag v1.4.2
git push https://github.com/Lyong2024/dsh-provider.git v1.4.2
```

`.github/workflows/release.yml` installs dependencies, builds, tests, packs, and uploads three files to the GitHub Release:

- `dsh-provider-1.4.2.tgz`
- `dsh-provider.tgz`
- `SHA256SUMS.txt`

The workflow does not edit the `awesome-dsh-plugin` catalog and does not publish to npm. After the install check succeeds, open a separate pull request that pins `tarball` to that tag URL.

## License

[MIT](LICENSE). Older release notes are in [CHANGELOG.md](CHANGELOG.md).
