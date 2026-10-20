#!/usr/bin/env node
// Writes every manifest in this repository from zoeki.plugin.json, and copies
// the logo into the Claude plugin folder.
// Dependency-free on purpose: `node scripts/generate.mjs` is the whole build.
// scripts/check.mjs calls render() and fails when a committed file differs.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// The Claude Code plugin's own folder. Anthropic's directory scans everything
// in a plugin folder as plugin code, and held the repository root for review
// because of these scripts; claude/ holds only what the plugin needs.
export const CLAUDE_DIR = 'claude';

const AGENT_PLUGINS = 'https://agent-plugins.org/schemas/1.0.0';
const MCP_REGISTRY_SCHEMA = 'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json';
const README_START = '<!-- generated:install -->';
const README_END = '<!-- /generated:install -->';

export function loadSource() {
  return JSON.parse(readFileSync(join(ROOT, 'zoeki.plugin.json'), 'utf8'));
}

// Every generated file, as { path: contents }: a string, or a Buffer for a
// copied image. README.md is included with only its install block replaced;
// the rest of it is hand-written.
export function render(src, readme = readFileSync(join(ROOT, 'README.md'), 'utf8')) {
  limits(src);

  const json = (value) => JSON.stringify(value, null, 2) + '\n';
  const author = { name: src.developer.name, email: src.developer.email, url: src.developer.url };
  const shared = {
    version: src.version,
    description: src.description,
    homepage: src.homepage,
    repository: src.repository,
    license: src.license,
    keywords: src.keywords,
  };
  const server = src.server;
  const role = src.role;
  const claudeMcp = json({ mcpServers: { [server.key]: { type: 'http', url: server.url } } });
  // Only name and description in the frontmatter: the one subset every reader accepts.
  const agent = [
    '---',
    `name: ${role.name}`,
    `description: ${JSON.stringify(role.description)}`,
    '---',
    '',
    ...role.body,
    '',
  ].join('\n');

  return {
    // Agent Plugins 1.0: Codex and ChatGPT (via the com.openai extension), Cursor,
    // VS Code and GitHub Copilot, Grok Build. Both files are closed schemas.
    'plugin.json': json({
      $schema: `${AGENT_PLUGINS}/plugin.schema.json`,
      name: src.name,
      ...pick(shared, 'version', 'description'),
      author,
      ...pick(shared, 'homepage', 'repository', 'license', 'keywords'),
      extensions: {
        'com.openai': {
          interface: {
            displayName: src.displayName,
            shortDescription: src.tagline,
            longDescription: src.longDescription,
            developerName: src.developer.name,
            category: src.categories.openai,
            capabilities: src.capabilities,
            websiteURL: src.homepage,
            supportURL: src.supportUrl,
            privacyPolicyURL: src.privacyUrl,
            termsOfServiceURL: src.termsUrl,
            defaultPrompt: src.defaultPrompts,
            brandColor: src.brandColor,
            brandColorDark: src.brandColorDark,
            composerIcon: `./${src.assets.composerIcon}`,
            logo: `./${src.assets.logoPng}`,
          },
        },
      },
    }),
    'mcp.json': json({
      $schema: `${AGENT_PLUGINS}/mcp.schema.json`,
      mcpServers: { [server.key]: { type: 'streamable-http', url: server.url } },
    }),

    // Grok Build and the Cursor manifest below.
    '.mcp.json': claudeMcp,

    // Claude Code: the marketplace at the root, the plugin in claude/ with its own
    // server, agent and logo. Claude Code ignores the listing fields (icon and the
    // four URLs); Anthropic's directory reads them.
    [`${CLAUDE_DIR}/.claude-plugin/plugin.json`]: json({
      name: src.name,
      displayName: src.displayName,
      ...pick(shared, 'version', 'description'),
      author,
      ...pick(shared, 'homepage', 'repository', 'license', 'keywords'),
      icon: `./${src.assets.logoPng}`,
      documentationUrl: src.docsUrl,
      supportUrl: src.supportUrl,
      privacyPolicyUrl: src.privacyUrl,
      termsOfServiceUrl: src.termsUrl,
    }),
    '.claude-plugin/marketplace.json': json({
      name: src.marketplace,
      owner: author,
      metadata: { description: `${src.displayName}: ${src.tagline.toLowerCase()}.` },
      plugins: [{ name: src.name, source: `./${CLAUDE_DIR}`, description: src.description }],
    }),
    [`${CLAUDE_DIR}/.mcp.json`]: claudeMcp,
    [`${CLAUDE_DIR}/agents/${role.name}.md`]: agent,
    [`${CLAUDE_DIR}/${src.assets.logoPng}`]: readFileSync(join(ROOT, src.assets.logoPng)),

    // Cursor Marketplace, which Grok Bot installs from. Cursor's author has no url,
    // and mcpServers points at .mcp.json so it never picks up the Agent Plugins mcp.json.
    '.cursor-plugin/plugin.json': json({
      name: src.name,
      displayName: src.displayName,
      ...pick(shared, 'version', 'description'),
      author: { name: author.name, email: author.email },
      ...pick(shared, 'homepage', 'repository', 'license'),
      logo: src.assets.logo,
      keywords: src.keywords,
      category: src.categories.cursor,
      tags: src.keywords.map(slug),
      mcpServers: './.mcp.json',
    }),
    '.cursor-plugin/marketplace.json': json({
      name: src.marketplace,
      owner: { name: author.name, email: author.email },
      metadata: { description: `${src.displayName}: ${src.tagline.toLowerCase()}.` },
      plugins: [{ name: src.name, source: './', description: src.description }],
    }),

    // Codex: `codex plugin marketplace add`. The plugin itself is the root plugin.json.
    '.agents/plugins/marketplace.json': json({
      name: src.marketplace,
      interface: { displayName: src.displayName },
      plugins: [
        {
          name: src.name,
          source: { source: 'local', path: './' },
          policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
          category: src.categories.openai,
        },
      ],
    }),

    // MCP Registry (VS Code gallery, GitHub Copilot, Zed). Namespace app.zoeki is
    // proven by a DNS TXT record on zoeki.app.
    'server.json': json({
      $schema: MCP_REGISTRY_SCHEMA,
      name: `app.zoeki/${src.name}`,
      title: src.displayName,
      description: src.description,
      version: src.version,
      websiteUrl: src.homepage,
      repository: { url: src.repository, source: 'github' },
      icons: [{ src: 'https://zoeki.app/icon-512.png', mimeType: 'image/png', sizes: ['512x512'] }],
      remotes: [{ type: 'streamable-http', url: server.url }],
    }),

    // Gemini CLI: httpUrl is streamable HTTP (a plain url would mean SSE).
    'gemini-extension.json': json({
      name: src.name,
      version: src.version,
      description: src.description,
      mcpServers: { [server.key]: { httpUrl: server.url, oauth: { enabled: true } } },
    }),

    // Cursor and Grok Bot, Grok Build and Gemini CLI read agents/*.md.
    [`agents/${role.name}.md`]: agent,

    'README.md': withInstallBlock(readme, installBlock(src)),
  };
}

function installBlock(src) {
  const url = src.server.url;
  const key = src.server.key;
  const repo = new URL(src.repository).pathname.slice(1);
  // Claude Code's built-in marketplace, which Anthropic's plugin directory publishes to.
  const claudeDirectory = 'anthropic-plugin-directory';
  const claudeLink =
    'https://claude.ai/customize/connectors?modal=add-custom-connector' +
    `&connectorName=${encodeURIComponent(src.displayName)}&connectorUrl=${encodeURIComponent(url)}`;
  const cursorLink =
    `cursor://anysphere.cursor-deeplink/mcp/install?name=${key}` +
    `&config=${Buffer.from(JSON.stringify({ url })).toString('base64')}`;
  const vscodeConfig = JSON.stringify({ name: key, type: 'http', url });

  return `## Install

The server URL, for any assistant that takes one:

\`\`\`
${url}
\`\`\`

### Claude (web, Desktop, mobile and Cowork)

From Claude's directory (if available): open **Settings → Plugins**, search **Discover** for ${src.displayName} and add it, or open **Settings → Connectors**, find ${src.displayName} and choose **Connect**. Then sign in.

Or [add ${src.displayName} as a custom connector](${claudeLink}), then choose **Connect** and sign in.

### Claude Code

From the Anthropic Directory (if available):

\`\`\`
/plugin install ${src.name}@${claudeDirectory}
\`\`\`

Or from this repository:

\`\`\`
/plugin marketplace add ${repo}
/plugin install ${src.name}@${src.marketplace}
\`\`\`

Either plugin also adds the Zoeki Coach agent. For the connection alone:

\`\`\`
claude mcp add --transport http ${key} ${url}
\`\`\`

### Cursor and Grok Bot

Open this link to add the server to Cursor:

\`\`\`
${cursorLink}
\`\`\`

In Grok Bot, ask in chat: "Add this MCP server: ${url}". Once ${src.displayName} is listed in the Cursor Marketplace, install it from **Connect apps** instead.

### ChatGPT

In **Settings → Apps & Connectors → Advanced**, turn on **Developer mode**, then **Create** a connector with the server URL and OAuth authentication.

### Codex

\`\`\`
codex plugin marketplace add ${repo}
codex plugin add ${src.name}@${src.marketplace}
\`\`\`

Or the connection alone:

\`\`\`
codex mcp add ${key} --url ${url}
codex mcp login ${key}
\`\`\`

### VS Code and GitHub Copilot

\`\`\`
code --add-mcp '${vscodeConfig}'
\`\`\`

### Grok Build

\`\`\`
grok plugin install ${repo} --trust
\`\`\`

### Gemini CLI

\`\`\`
gemini extensions install ${src.repository}
\`\`\`
`;
}

function withInstallBlock(readme, block) {
  const start = readme.indexOf(README_START);
  const end = readme.indexOf(README_END);
  if (start < 0 || end < start) throw new Error(`README.md needs ${README_START} and ${README_END}`);
  return readme.slice(0, start + README_START.length) + '\n' + block + readme.slice(end);
}

// Listing limits the platforms enforce at submission, caught here instead.
function limits(src) {
  const fail = [];
  const max = (label, value, n) => value.length > n && fail.push(`${label} is ${value.length} characters (max ${n})`);
  max('displayName', src.displayName, 30); // OpenAI
  max('tagline', src.tagline, 30); // OpenAI shortDescription
  max('description', src.description, 100); // MCP Registry
  max('longDescription', src.longDescription, 4000); // OpenAI
  max('role.description', src.role.description, 1024); // Agent Skills, the strictest reader
  src.defaultPrompts.length > 3 && fail.push('defaultPrompts has more than 3 entries'); // OpenAI
  src.defaultPrompts.forEach((p, i) => max(`defaultPrompts[${i}]`, p, 128));
  /^[a-z0-9]+(-[a-z0-9]+)*$/.test(src.name) || fail.push('name must be lowercase letters, digits and single hyphens');
  if (fail.length) throw new Error('zoeki.plugin.json:\n  ' + fail.join('\n  '));
}

function pick(object, ...keys) {
  return Object.fromEntries(keys.map((k) => [k, object[k]]));
}

function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = render(loadSource());
  for (const [path, contents] of Object.entries(files)) {
    mkdirSync(dirname(join(ROOT, path)), { recursive: true });
    writeFileSync(join(ROOT, path), contents);
  }
  console.log(`Wrote ${Object.keys(files).length} files.`);
}
