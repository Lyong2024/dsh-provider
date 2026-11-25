// Model config settings page. Classic script: the host loads it through ModuleLoader.
// React stays on require("react"); this file has no static import.

declare const window: {
  __ModuleLoader__: {
    load: (spec: {
      id: string;
      factory: (require: (id: string) => ReactLike) => { inject: string[]; apply: (ctx: HostContext) => void };
    }) => void;
  };
};

declare const document: {
  createElement: (tag: string) => {
    id: string;
    textContent: string;
    setAttribute: (name: string, value: string) => void;
  };
  head: { appendChild: (node: unknown) => void } | null;
  getElementById: (id: string) => unknown;
  body: { appendChild: (node: unknown) => void } | null;
};

interface ReactElement {
  readonly kind?: "element";
}

interface ReactLike {
  createElement: (
    type: string | ((props: CardProps) => ReactElement),
    props: Record<string, unknown> | null,
    ...children: unknown[]
  ) => ReactElement;
  useState: <T>(initial: T | (() => T)) => [T, (next: T | ((prev: T) => T)) => void];
  useEffect: (effect: () => void | (() => void), deps?: unknown[]) => void;
}

interface Dict {
  [key: string]: string;
}

interface HostContext {
  effect: (run: () => void, label: string) => void;
  locale: {
    register: (ns: string, dictionaries: { zh: Dict; en: Dict }) => void;
    bind: (ns: string) => (key: string) => string;
  };
  slots: {
    inject: (name: string, register: () => void) => void;
    register: (
      meta: { name: string; id: string; order: number; label: () => string; inject: () => { t: (key: string) => string } },
      component: (props: CardProps) => ReactElement,
    ) => void;
  };
}

type Kind = "api" | "login" | "local" | "search";
type Wire = "anthropic-messages" | "openai-completions" | "openai-responses" | "google-generative-ai";
type Auth = "bearer" | "x-api-key" | "dual" | "dummy";
type Tab = "api" | "login";

interface CatalogEntry {
  id: string;
  name: string;
  kind: Kind;
  api: string;
  env?: string;
  baseUrl?: string;
  models?: { id: string; name: string }[];
}

interface Profile {
  id: string;
  presetId: string;
  name: string;
  notes: string;
  kind: "api" | "local" | "search";
  baseUrl: string;
  api: Wire;
  auth: Auth;
  hasKey: boolean;
  model: string;
  isDefault: boolean;
  order: number;
}

interface ProbeValue {
  connectivity?: { ok?: boolean; message?: string };
  protocol?: { skipped?: boolean; message?: string };
}

interface LoginOffer {
  id: string;
  phase: "link" | "waiting" | "saved" | "failed";
  url?: string;
  instructions?: string;
  userCode?: string;
  message?: string;
}

interface CardProps {
  t?: (key: string) => string;
}

interface Draft {
  id?: string;
  presetId: string;
  name: string;
  kind: "api" | "local" | "search";
  baseUrl: string;
  api: Wire;
  auth: Auth;
  key: string;
  model: string;
}

const NS = "settings.dsh-provider";
const BRIDGE = "/api/dsh-provider";
const WIRES: Wire[] = ["anthropic-messages", "openai-completions", "openai-responses", "google-generative-ai"];
const AUTHS: Auth[] = ["bearer", "x-api-key", "dual", "dummy"];

const zh: Dict = {
  nav: "模型配置",
  title: "模型配置",
  subtitle: "订阅登录、API Key 和本机引擎。供应商按登录方式分，不按国家分。",
  tabApi: "API Key",
  tabLogin: "官方平台",
  search: "搜索名称、地址或模型",
  searchLabel: "搜索",
  add: "添加模型",
  import: "导入配置",
  importHint: "导入会在后续版本读入 JSON，这一步还不会改档案。",
  emptyApi: "还没有档案。添加一个 API Key 或本地引擎。",
  emptyLogin: "目录里还没有官方平台。",
  emptyFilter: "没有匹配的供应商。",
  badgeLocal: "本地",
  makeDefault: "设为默认",
  test: "测试",
  check: "检查连接",
  edit: "编辑",
  save: "保存",
  cancel: "取消",
  delete: "删除",
  filterAll: "全部",
  filterApi: "API Key",
  filterLogin: "官方平台",
  filterLocal: "本地",
  filterSearch: "检索",
  fieldPreset: "预设",
  fieldName: "名称",
  fieldUrl: "接口地址",
  fieldApi: "API 格式",
  fieldAuth: "认证",
  fieldKey: "API Key",
  fieldModel: "主模型",
  fieldPlatform: "平台",
  currentPlatform: "当前登录",
  loginRequired: "还没有登录任何官方平台，也没有 API Key。请先登录。",
  loginRequiredAction: "去登录",
  signInPlatform: "这个平台还没有登录。模型可以先看，使用前请登录。",
  modelsEmpty: "这个平台没有内置模型列表，可以手填模型名。",
  useModel: "使用",
  loginPending: "授权链接显示在这一行。本页不会打开外部授权，点链接才进入。",
  openLink: "打开授权链接",
  loginSaved: "已登录",
  loginCode: "验证码",
  signIn: "登录",
  signOut: "退出",
  signedOut: "未登录",
  searchHint: "挂到对话上做搜索，不伪装成聊天模型。",
  connectivity: "连通",
  protocol: "协议转换",
  protocolSkipped: "跳过",
  loading: "正在读取目录…",
  dialogAdd: "添加模型",
  dialogEdit: "编辑档案",
  laterNote: "窗口、压缩和图片会接到每一份档案，这一轮先保存连接信息。",
};

const en: Dict = {
  nav: "Model config",
  title: "Model config",
  subtitle: "Subscriptions, API keys, and local engines. Providers are grouped by login method, not by country.",
  tabApi: "API Key",
  tabLogin: "Official platforms",
  search: "Search name, URL, or model",
  searchLabel: "Search",
  add: "Add model",
  import: "Import",
  importHint: "Import will read JSON in a later version. This step does not change profiles.",
  emptyApi: "No profiles yet. Add an API key or a local engine.",
  emptyLogin: "No official platforms are in the catalog.",
  emptyFilter: "No matching providers.",
  badgeLocal: "Local",
  makeDefault: "Make default",
  test: "Test",
  check: "Check",
  edit: "Edit",
  save: "Save",
  cancel: "Cancel",
  delete: "Delete",
  filterAll: "All",
  filterApi: "API Key",
  filterLogin: "Official platforms",
  filterLocal: "Local",
  filterSearch: "Search",
  fieldPreset: "Preset",
  fieldName: "Name",
  fieldUrl: "Base URL",
  fieldApi: "API format",
  fieldAuth: "Auth",
  fieldKey: "API key",
  fieldModel: "Primary model",
  fieldPlatform: "Platform",
  currentPlatform: "Signed in",
  loginRequired: "No official platform is signed in, and no API key is saved. Sign in first.",
  loginRequiredAction: "Sign in",
  signInPlatform: "This platform is not signed in. You can review its models, then sign in before use.",
  modelsEmpty: "This platform has no built-in model list. Type a model name.",
  useModel: "Use",
  loginPending: "The authorization link stays on this row. This page will not open an external authorization on its own.",
  openLink: "Open authorization link",
  loginSaved: "Signed in",
  loginCode: "Code",
  signIn: "Sign in",
  signOut: "Sign out",
  signedOut: "Signed out",
  searchHint: "Attached to a chat as search. It is not a chat model.",
  connectivity: "Connectivity",
  protocol: "Protocol",
  protocolSkipped: "skipped",
  loading: "Loading catalog…",
  dialogAdd: "Add model",
  dialogEdit: "Edit profile",
  laterNote: "Context window, compaction, and images attach to every profile. This pass stores the connection.",
};

function installStyles(): void {
  if (document.getElementById("mcp-styles") !== null) return;
  const style = document.createElement("style");
  style.id = "mcp-styles";
  style.textContent = [
    ".mcp{color:var(--dsw-alias-label-primary);font:14px/1.45 ui-sans-serif,system-ui,sans-serif}",
    ".mcp-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-end;margin-bottom:14px}",
    ".mcp h2{margin:0;font-size:18px;font-weight:600}",
    ".mcp-sub{margin:4px 0 0;color:var(--dsw-alias-label-tertiary);max-width:62ch}",
    ".mcp-actions{display:flex;gap:8px;flex-wrap:wrap}",
    ".mcp-tabs{display:flex;gap:22px;align-items:flex-end;margin:0 0 10px;border-bottom:0.5px solid var(--dsw-alias-border-l2)}",
    ".mcp-tab,.mcp-btn,.mcp-chip{border:0;background:transparent;color:var(--dsw-alias-label-tertiary);padding:7px 1px 9px;cursor:pointer;font:inherit}",
    ".mcp-tab.is-on,.mcp-chip.is-on{color:var(--dsw-alias-label-primary);box-shadow:inset 0 -2px 0 var(--dsw-alias-label-primary)}",
    ".mcp-btn{border:0.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);padding:6px 12px;color:var(--dsw-alias-label-primary)}",
    ".mcp-btn.primary{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3);border-color:var(--dsw-alias-label-primary)}",
    ".mcp-search{width:100%;box-sizing:border-box;margin:0 0 12px;padding:8px 12px;border-radius:var(--dsw-radius-md);border:0.5px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary)}",
    ".mcp-list{display:flex;flex-direction:column;gap:10px}",
    ".mcp-card{display:flex;gap:12px;align-items:flex-start;padding:12px 0;border-bottom:0.5px solid var(--dsw-alias-border-l2);background:transparent}",
    ".mcp-card.is-default{box-shadow:inset 2px 0 0 var(--dsw-alias-state-business-primary)}",
    ".mcp-card.is-signed-in{position:relative;padding:10px 10px 10px 16px;background:var(--dsw-alias-interactive-bg-hover);border-radius:var(--dsw-radius-md)}",
    ".mcp-signed-bar{position:absolute;left:0;top:8px;bottom:8px;width:4px;border-radius:var(--dsw-radius-xs);background:var(--dsw-alias-button-primary-fill)}",
    ".mcp-models{display:flex;flex-direction:column;gap:2px;max-height:220px;overflow:auto;margin:4px 0 8px}",
    ".mcp-model{position:relative;display:block;width:100%;text-align:left;border:0;background:transparent;color:var(--dsw-alias-label-primary);border-radius:var(--dsw-radius-md);padding:7px 10px 7px 14px;font:inherit;cursor:pointer}",
    ".mcp-model.is-on{background:var(--dsw-alias-interactive-bg-hover);box-shadow:inset 4px 0 0 var(--dsw-alias-button-primary-fill)}",
    ".mcp-dot{width:8px;height:8px;border-radius:99px;margin-top:7px;background:var(--dsw-alias-label-tertiary);flex:none}",
    ".mcp-dot.is-on{background:var(--dsw-alias-state-success-primary)}",
    ".mcp-main{flex:1;min-width:0}",
    ".mcp-name{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-weight:600;color:var(--dsw-alias-label-primary)}",
    ".mcp-badge{font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary);border:0.5px solid var(--dsw-alias-border-l2);border-radius:999px;padding:1px 7px}",
    ".mcp-line,.mcp-note,.mcp-hint,.mcp-probe{color:var(--dsw-alias-label-tertiary);font-size:12px;margin-top:3px}",
    ".mcp-link{display:block;margin-top:6px;color:var(--dsw-alias-label-primary);font-size:12px;word-break:break-all}",
    ".mcp-rowbtns{display:flex;gap:6px;flex-wrap:wrap}",
    ".mcp-error{color:var(--dsw-alias-state-error-primary);font-size:13px;margin:8px 0}",
    ".mcp-backdrop{position:fixed;inset:0;background:color-mix(in srgb, var(--dsw-alias-label-primary) 28%, transparent);display:flex;align-items:flex-start;justify-content:center;padding:8vh 16px 16px;z-index:40}",
    ".mcp-dialog{width:min(520px,100%);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);border:0.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);padding:16px}",
    ".mcp-dialog h3{margin:0 0 8px}",
    ".mcp-form{display:flex;flex-direction:column;gap:8px}",
    ".mcp-form label{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--dsw-alias-label-tertiary)}",
    ".mcp-form input,.mcp-form select{padding:8px 10px;border-radius:var(--dsw-radius-md);border:0.5px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary)}",
    ".mcp-chips{display:flex;gap:6px;flex-wrap:wrap}",
    ".mcp-btn:focus-visible,.mcp-tab:focus-visible,.mcp-chip:focus-visible,.mcp-model:focus-visible,.mcp-search:focus-visible,.mcp-link:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));outline-offset:2px}",
    "@media (max-width:640px){.mcp-card{flex-direction:column}.mcp-head{flex-direction:column;align-items:stretch}}",
  ].join("");
  document.head?.appendChild(style);
}

function textOf(value: string): string {
  return value;
}

window.__ModuleLoader__.load({
  id: "dsh-provider",
  factory: (require) => {
    const react = require("react");
    const h = react.createElement;

    function el(tag: string, props: Record<string, unknown> | null, ...children: unknown[]): ReactElement {
      return h(tag, props, ...children);
    }

    async function bridge<T>(path: string, body?: Record<string, unknown>): Promise<T> {
      const response = await fetch(path, {
        method: body === undefined ? "GET" : "POST",
        headers: body === undefined ? undefined : { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const payload = (await response.json()) as { ok?: boolean; value?: T; message?: string };
      if (!response.ok || payload.ok === false) throw new Error(payload.message ?? "request failed");
      return payload.value as T;
    }

    function safeHref(url: string): string {
      try {
        const parsed = new URL(url);
        if (parsed.protocol === "https:") return url;
        if (parsed.protocol === "http:" && (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost")) return url;
      } catch {
        return "";
      }
      return "";
    }

    function blankDraft(kind: Draft["kind"] = "api"): Draft {
      return {
        presetId: "",
        name: "",
        kind,
        baseUrl: "",
        api: "openai-completions",
        auth: kind === "local" ? "dummy" : "bearer",
        key: "",
        model: "",
      };
    }

    function ModelConfigCard(props: CardProps): ReactElement {
      const t = props.t ?? ((key: string) => key);
      const [tab, setTab] = react.useState<Tab>("login");
      const [query, setQuery] = react.useState("");
      const [platformId, setPlatformId] = react.useState("");
      const [pickedModel, setPickedModel] = react.useState("");
      const [catalog, setCatalog] = react.useState<CatalogEntry[]>([]);
      const [profiles, setProfiles] = react.useState<Profile[]>([]);
      const [error, setError] = react.useState("");
      const [notice, setNotice] = react.useState("");
      const [busy, setBusy] = react.useState(false);
      const [dialog, setDialog] = react.useState(false);
      const [draft, setDraft] = react.useState<Draft>(blankDraft());
      const [probes, setProbes] = react.useState<Record<string, string>>({});
      const [offers, setOffers] = react.useState<Record<string, LoginOffer>>({});

      react.useEffect(() => {
        installStyles();
        let gone = false;
        void (async () => {
          try {
            const [nextCatalog, nextProfiles] = await Promise.all([
              bridge<CatalogEntry[]>(`${BRIDGE}/catalog`),
              bridge<Profile[]>(`${BRIDGE}/profiles`),
            ]);
            if (gone) return;
            setCatalog(Array.isArray(nextCatalog) ? nextCatalog : []);
            setProfiles(Array.isArray(nextProfiles) ? nextProfiles : []);
            try {
              const nextLogins = await bridge<LoginOffer[]>(`${BRIDGE}/login`);
              if (!gone && Array.isArray(nextLogins)) {
                const map: Record<string, LoginOffer> = {};
                for (const item of nextLogins) map[item.id] = item;
                setOffers(map);
                const saved = nextLogins.find((item) => item.phase === "saved");
                if (saved !== undefined) {
                  const entry = (Array.isArray(nextCatalog) ? nextCatalog : []).find((row) => row.id === saved.id);
                  setPlatformId(saved.id);
                  setPickedModel(entry?.models?.[0]?.id ?? "");
                }
              }
            } catch {
              /* a missing login list still leaves the catalog usable */
            }
          } catch (cause) {
            if (!gone) setError(cause instanceof Error ? cause.message : String(cause));
          }
        })();
        return () => {
          gone = true;
        };
      }, []);

      const waitingIds = Object.keys(offers).filter((id) => offers[id]?.phase === "waiting").join(",");
      react.useEffect(() => {
        if (waitingIds.length === 0) return undefined;
        let gone = false;
        const timer = setInterval(() => {
          for (const id of waitingIds.split(",")) {
            void bridge<LoginOffer>(`${BRIDGE}/login?id=${encodeURIComponent(id)}`).then((value) => {
              if (!gone) setOffers((prev) => ({ ...prev, [id]: value }));
            }).catch(() => undefined);
          }
        }, 3000);
        return () => {
          gone = true;
          clearInterval(timer);
        };
      }, [waitingIds]);

      async function reload(): Promise<void> {
        const next = await bridge<Profile[]>(`${BRIDGE}/profiles`);
        setProfiles(Array.isArray(next) ? next : []);
      }

      async function run(task: () => Promise<void>): Promise<void> {
        setBusy(true);
        setError("");
        try {
          await task();
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : String(cause));
        } finally {
          setBusy(false);
        }
      }

      const needle = query.trim().toLowerCase();
      const apiRows = profiles.filter((row) => row.kind === "api" || row.kind === "local").filter((row) => {
        if (needle.length === 0) return true;
        return `${row.name} ${row.baseUrl} ${row.model}`.toLowerCase().includes(needle);
      });
      const loginRows = catalog.filter((row) => row.kind === "login").filter((row) => {
        if (needle.length === 0) return true;
        return `${row.name} ${row.baseUrl ?? ""}`.toLowerCase().includes(needle);
      }).slice().sort((left, right) => {
        const leftSaved = offers[left.id]?.phase === "saved" ? 0 : 1;
        const rightSaved = offers[right.id]?.phase === "saved" ? 0 : 1;
        return leftSaved - rightSaved;
      });
      const platformRows = catalog.filter((row) => row.kind === "login" || row.kind === "api" || row.kind === "local").slice().sort((left, right) => {
        const rank = (row: CatalogEntry): number => {
          if (row.kind === "login") return offers[row.id]?.phase === "saved" ? 0 : 1;
          return row.kind === "api" ? 2 : 3;
        };
        return rank(left) - rank(right);
      });
      const selectedPlatform = platformRows.find((row) => row.id === platformId);
      const selectedModels = selectedPlatform?.models ?? [];
      const platformSignedIn = selectedPlatform !== undefined && offers[selectedPlatform.id]?.phase === "saved";
      const officialPlatform = selectedPlatform?.kind === "login";
      const hasApiKey = profiles.some((row) => row.kind === "api" && row.hasKey);
      const savedLogin = catalog.some((row) => row.kind === "login" && offers[row.id]?.phase === "saved");

      function choosePlatform(entry: CatalogEntry, keep: boolean): void {
        const models = entry.models ?? [];
        const nextModel = keep && (models.some((model) => model.id === pickedModel) || (models.length === 0 && pickedModel.length > 0))
          ? pickedModel
          : (models[0]?.id ?? "");
        setPlatformId(entry.id);
        setPickedModel(nextModel);
        if (entry.kind === "login" || entry.kind === "search") return;
        const kind = entry.kind === "local" ? "local" : "api";
        const api = WIRES.includes(entry.api as Wire) ? (entry.api as Wire) : "openai-completions";
        setDraft({
          ...draft,
          presetId: entry.id,
          name: entry.name,
          kind,
          baseUrl: entry.baseUrl ?? "",
          api,
          auth: kind === "local" ? "dummy" : "bearer",
          model: nextModel,
        });
      }

      function openDialog(): void {
        setDraft(blankDraft());
        const saved = catalog.find((row) => row.kind === "login" && offers[row.id]?.phase === "saved");
        const current = catalog.find((row) => row.id === platformId) ?? saved ?? platformRows[0];
        if (current !== undefined) choosePlatform(current, current.id === platformId);
        setDialog(true);
        setNotice("");
      }

      function goLogin(name: string): void {
        setDialog(false);
        setTab("login");
        setQuery(name);
      }

      function openEdit(row: Profile): void {
        setPlatformId(row.presetId);
        setPickedModel(row.model);
        setDraft({
          id: row.id,
          presetId: row.presetId,
          name: row.name,
          kind: row.kind,
          baseUrl: row.baseUrl,
          api: row.api,
          auth: row.kind === "local" ? "dummy" : row.auth,
          key: "",
          model: row.model,
        });
        setDialog(true);
        setNotice("");
      }

      const hideKey = draft.kind === "local" || draft.kind === "search";

      const card = (row: Profile): ReactElement =>
        el(
          "article",
          { className: row.isDefault ? "mcp-card is-default" : "mcp-card", key: row.id },
          el("span", { className: row.hasKey || row.kind === "local" ? "mcp-dot is-on" : "mcp-dot", "aria-hidden": "true" }),
          el(
            "div",
            { className: "mcp-main" },
            el(
              "div",
              { className: "mcp-name" },
              el("span", { "aria-hidden": "true" }, "⋮⋮"),
              textOf(row.name),
              row.kind === "local" ? el("span", { className: "mcp-badge" }, t("badgeLocal")) : null,
            ),
            el("div", { className: "mcp-line" }, `${row.baseUrl} · ${row.api} · ${row.model}`),
            probes[row.id] !== undefined ? el("div", { className: "mcp-probe" }, probes[row.id]) : null,
          ),
          el(
            "div",
            { className: "mcp-rowbtns" },
            el("button", { className: "mcp-btn", type: "button", disabled: busy, onClick: () => void run(async () => { await bridge(`${BRIDGE}/profiles`, { action: "default", id: row.id }); await reload(); }) }, t("makeDefault")),
            el("button", { className: "mcp-btn", type: "button", disabled: busy, onClick: () => void run(async () => {
              const value = await bridge<ProbeValue>(`${BRIDGE}/profiles`, { action: "test", id: row.id });
              const reach = value.connectivity?.ok === true ? "ok" : (value.connectivity?.message ?? "failed");
              const protocol = value.protocol?.skipped === true ? t("protocolSkipped") : (value.protocol?.message ?? "");
              setProbes({ ...probes, [row.id]: `${t("connectivity")}: ${reach} · ${t("protocol")}: ${protocol}` });
            }) }, row.kind === "local" ? t("check") : t("test")),
            el("button", { className: "mcp-btn", type: "button", onClick: () => openEdit(row) }, t("edit")),
          ),
        );

      const loginCard = (entry: CatalogEntry): ReactElement => {
        const offer = offers[entry.id];
        const signedIn = offer?.phase === "saved";
        const href = signedIn || offer?.url === undefined ? "" : safeHref(offer.url);
        return el(
          "article",
          { className: signedIn ? "mcp-card is-signed-in" : "mcp-card", key: entry.id },
          signedIn ? el("span", { className: "mcp-signed-bar", "aria-hidden": "true" }) : null,
          el("span", { className: signedIn ? "mcp-dot is-on" : "mcp-dot", "aria-hidden": "true" }),
          el(
            "div",
            { className: "mcp-main" },
            el("div", { className: "mcp-name" }, textOf(entry.name), el("span", { className: "mcp-badge" }, signedIn ? t("loginSaved") : t("signedOut"))),
            signedIn && platformId === entry.id && pickedModel.length > 0
              ? el("div", { className: "mcp-line" }, entry.models?.find((model) => model.id === pickedModel)?.name ?? pickedModel)
              : null,
            href.length > 0
              ? el("a", { className: "mcp-link", href, target: "_blank", rel: "noopener noreferrer", "aria-label": t("openLink") }, href)
              : null,
            !signedIn && offer?.userCode !== undefined && offer.userCode.length > 0 ? el("div", { className: "mcp-line" }, `${t("loginCode")} ${offer.userCode}`) : null,
            !signedIn && offer?.instructions !== undefined && offer.instructions.length > 0 ? el("div", { className: "mcp-note" }, offer.instructions) : null,
            offer?.phase === "failed" && offer.message !== undefined ? el("p", { className: "mcp-error" }, offer.message) : null,
          ),
          el("button", {
            className: "mcp-btn",
            type: "button",
            disabled: busy,
            onClick: () => void run(async () => {
              if (signedIn) {
                await bridge<LoginOffer>(`${BRIDGE}/login`, { id: entry.id, action: "sign-out" });
                setOffers((prev) => {
                  const next = { ...prev };
                  delete next[entry.id];
                  return next;
                });
                return;
              }
              const value = await bridge<LoginOffer>(`${BRIDGE}/login`, { id: entry.id });
              setOffers((prev) => ({ ...prev, [entry.id]: value }));
            }),
          }, signedIn ? t("signOut") : t("signIn")),
        );
      };

      const field = (label: string, control: ReactElement): ReactElement => el("label", null, textOf(label), control);
      const askLogin = draft.id === undefined && !savedLogin && !hasApiKey;

      const dialogBox = !dialog
        ? null
        : el(
            "div",
            { className: "mcp-backdrop", onClick: () => setDialog(false) },
            el(
              "div",
              {
                className: "mcp-dialog",
                role: "dialog",
                "aria-modal": "true",
                "aria-label": draft.id === undefined ? t("dialogAdd") : t("dialogEdit"),
                onClick: (event: { stopPropagation: () => void }) => event.stopPropagation(),
              },
              el("h3", null, draft.id === undefined ? t("dialogAdd") : t("dialogEdit")),
              askLogin
                ? el(
                    "div",
                    null,
                    el("p", { className: "mcp-hint" }, t("loginRequired")),
                    el("div", { className: "mcp-actions" },
                      el("button", { className: "mcp-btn primary", type: "button", onClick: () => goLogin("") }, t("loginRequiredAction")),
                      el("button", { className: "mcp-btn", type: "button", onClick: () => setDialog(false) }, t("cancel")),
                    ),
                  )
                : el(
                    "div",
                    null,
                    selectedPlatform !== undefined
                      ? el("p", { className: "mcp-hint" }, `${platformSignedIn ? t("currentPlatform") : t("fieldPlatform")} ${selectedPlatform.name}`)
                      : null,
                    el(
                      "div",
                      { className: "mcp-form" },
                      field(
                        t("fieldPlatform"),
                        el(
                          "select",
                          {
                            value: selectedPlatform?.id ?? "",
                            "aria-label": t("fieldPlatform"),
                            onChange: (event: { target: { value: string } }) => {
                              const entry = platformRows.find((row) => row.id === event.target.value);
                              if (entry !== undefined) choosePlatform(entry, false);
                            },
                          },
                          ...platformRows.map((entry) => el(
                            "option",
                            { key: entry.id, value: entry.id },
                            offers[entry.id]?.phase === "saved" ? `${entry.name} · ${t("loginSaved")}` : entry.name,
                          )),
                        ),
                      ),
                      officialPlatform && !platformSignedIn ? el("p", { className: "mcp-hint" }, t("signInPlatform")) : null,
                      officialPlatform && !platformSignedIn
                        ? el("button", { className: "mcp-btn", type: "button", onClick: () => goLogin(selectedPlatform?.name ?? "") }, t("loginRequiredAction"))
                        : null,
                      selectedModels.length > 0
                        ? field(
                            t("fieldModel"),
                            el(
                              "div",
                              { className: "mcp-models", role: "listbox", "aria-label": t("fieldModel") },
                              ...selectedModels.map((model) => el(
                                "button",
                                {
                                  key: model.id,
                                  type: "button",
                                  role: "option",
                                  "aria-selected": pickedModel === model.id,
                                  className: pickedModel === model.id ? "mcp-model is-on" : "mcp-model",
                                  onClick: () => {
                                    setPickedModel(model.id);
                                    setDraft({ ...draft, model: model.id });
                                  },
                                },
                                model.name,
                              )),
                            ),
                          )
                        : field(t("fieldModel"), el("input", {
                            value: pickedModel,
                            onChange: (event: { target: { value: string } }) => {
                              setPickedModel(event.target.value);
                              setDraft({ ...draft, model: event.target.value });
                            },
                          })),
                      selectedModels.length === 0 ? el("p", { className: "mcp-hint" }, t("modelsEmpty")) : null,
                      officialPlatform || hideKey ? null : field(t("fieldName"), el("input", { value: draft.name, onChange: (event: { target: { value: string } }) => setDraft({ ...draft, name: event.target.value }) })),
                      officialPlatform ? null : field(t("fieldUrl"), el("input", { value: draft.baseUrl, onChange: (event: { target: { value: string } }) => setDraft({ ...draft, baseUrl: event.target.value }) })),
                      officialPlatform
                        ? null
                        : field(
                            t("fieldApi"),
                            el(
                              "select",
                              { value: draft.api, onChange: (event: { target: { value: string } }) => setDraft({ ...draft, api: WIRES.includes(event.target.value as Wire) ? (event.target.value as Wire) : draft.api }) },
                              ...WIRES.map((wire) => el("option", { key: wire, value: wire }, wire)),
                            ),
                          ),
                      officialPlatform || hideKey
                        ? null
                        : field(
                            t("fieldAuth"),
                            el(
                              "select",
                              { value: draft.auth, onChange: (event: { target: { value: string } }) => setDraft({ ...draft, auth: AUTHS.includes(event.target.value as Auth) ? (event.target.value as Auth) : draft.auth }) },
                              ...AUTHS.filter((item) => item !== "dummy").map((item) => el("option", { key: item, value: item }, item)),
                            ),
                          ),
                      officialPlatform || hideKey
                        ? null
                        : field(t("fieldKey"), el("input", { type: "password", value: draft.key, autoComplete: "off", onChange: (event: { target: { value: string } }) => setDraft({ ...draft, key: event.target.value }) })),
                      draft.kind === "search" ? el("p", { className: "mcp-hint" }, t("searchHint")) : null,
                      officialPlatform ? null : el("p", { className: "mcp-hint" }, t("laterNote")),
                    ),
                    el(
                      "div",
                      { className: "mcp-actions" },
                      officialPlatform
                        ? el("button", { className: "mcp-btn primary", type: "button", onClick: () => setDialog(false) }, t("useModel"))
                        : el(
                            "button",
                            {
                              className: "mcp-btn primary",
                              type: "button",
                              disabled: busy || draft.kind === "search",
                              onClick: () => void run(async () => {
                                await bridge(`${BRIDGE}/profiles`, {
                                  action: "save",
                                  id: draft.id,
                                  presetId: draft.presetId || selectedPlatform?.id,
                                  name: draft.name,
                                  kind: draft.kind,
                                  baseUrl: draft.baseUrl,
                                  api: draft.api,
                                  auth: draft.kind === "local" ? "dummy" : draft.auth,
                                  key: hideKey ? "" : draft.key,
                                  model: pickedModel || draft.model,
                                });
                                await reload();
                                setDialog(false);
                              }),
                            },
                            t("save"),
                          ),
                      draft.id !== undefined && !officialPlatform
                        ? el("button", { className: "mcp-btn", type: "button", disabled: busy, onClick: () => void run(async () => {
                            await bridge(`${BRIDGE}/profiles`, { action: "delete", id: draft.id });
                            await reload();
                            setDialog(false);
                          }) }, t("delete"))
                        : null,
                      el("button", { className: "mcp-btn", type: "button", onClick: () => setDialog(false) }, t("cancel")),
                    ),
                  ),
            ),
          );

      return el(
        "section",
        { className: "mcp" },
        el(
          "div",
          { className: "mcp-head" },
          el("div", null, el("h2", null, t("title")), el("p", { className: "mcp-sub" }, t("subtitle"))),
          el(
            "div",
            { className: "mcp-actions" },
            el("button", { className: "mcp-btn", type: "button", onClick: () => setNotice(t("importHint")) }, t("import")),
            el("button", { className: "mcp-btn primary", type: "button", onClick: () => openDialog() }, t("add")),
          ),
        ),
        el(
          "div",
          { className: "mcp-tabs", role: "tablist" },
          el("button", { className: tab === "login" ? "mcp-tab is-on" : "mcp-tab", type: "button", onClick: () => setTab("login") }, t("tabLogin")),
          el("button", { className: tab === "api" ? "mcp-tab is-on" : "mcp-tab", type: "button", onClick: () => setTab("api") }, t("tabApi")),
        ),
        el("label", { className: "mcp-note" }, t("searchLabel")),
        el("input", {
          className: "mcp-search",
          value: query,
          placeholder: t("search"),
          "aria-label": t("searchLabel"),
          onChange: (event: { target: { value: string } }) => setQuery(event.target.value),
        }),
        error.length > 0 ? el("p", { className: "mcp-error" }, error) : null,
        notice.length > 0 ? el("p", { className: "mcp-note" }, notice) : null,
        tab === "login" && platformSignedIn && selectedPlatform !== undefined ? el("p", { className: "mcp-hint" }, `${t("currentPlatform")} ${selectedPlatform.name}`) : null,
        tab === "login" ? el("p", { className: "mcp-hint" }, t("loginPending")) : null,
        tab === "api"
          ? el("div", { className: "mcp-list" }, apiRows.length === 0 ? el("p", { className: "mcp-note" }, t("emptyApi")) : apiRows.map(card))
          : el("div", { className: "mcp-list" }, loginRows.length === 0 ? el("p", { className: "mcp-note" }, catalog.length === 0 ? t("loading") : t("emptyLogin")) : loginRows.map(loginCard)),
        dialogBox,
      );
    }

    function apply(ctx: HostContext): void {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-provider: dictionaries");
      const t = ctx.locale.bind(NS);
      ctx.slots.inject("settings.section", () =>
        ctx.slots.register(
          {
            name: "settings.section",
            id: "dsh-provider",
            order: 85,
            label: () => t("nav"),
            inject: () => ({ t }),
          },
          ModelConfigCard,
        ),
      );
    }

    return { inject: ["slots", "locale"], apply };
  },
});
