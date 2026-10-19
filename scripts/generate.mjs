#!/usr/bin/env node
// Writes every manifest in this repository from zoeki.plugin.json.
// Dependency-free on purpose: `node scripts/generate.mjs` is the whole build.
// scripts/check.mjs calls render() and fails when a committed file differs.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const AGENT_PLUGINS = 'https://agent-plugins.org/schemas/1.0.0';
const MCP_REGISTRY_SCHEMA = 'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json';
const README_START = '<!-- generated:install -->';
const README_END = '<!-- /generated:install -->';

export function loadSource() {
  return JSON.parse(readFileSync(join(ROOT, 'zoeki.plugin.json'), 'utf8'));
}

// Every generated file, as { path: contents }. README.md is included with only
// its install block replaced; the rest of it is hand-written.
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

    // Claude Code, Grok Build and the Cursor manifest below.
    '.mcp.json': json({ mcpServers: { [server.key]: { type: 'http', url: server.url } } }),

    // Claude Code ignores the listing fields (icon and the four URLs); Anthropic's
    // directory reads them. The marketplace entry's "./" is the repo root itself.
    '.claude-plugin/plugin.json': json({
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
      plugins: [{ name: src.name, source: './', description: src.description }],
    }),

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

    // Claude Code, Cursor and Grok Bot, Grok Build and Gemini CLI read agents/*.md.
    // Only name and description in the frontmatter: the one subset they all accept.
    [`agents/${role.name}.md`]: [
      '---',
      `name: ${role.name}`,
      `description: ${JSON.stringify(role.description)}`,
      '---',
      '',
      ...role.body,
      '',
    ].join('\n'),

    'README.md': withInstallBlock(readme, installBlock(src)),
  };
}

function installBlock(src) {
  const url = src.server.url;
  const key = src.server.key;
  const repo = new URL(src.repository).pathname.slice(1);
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

[Add ${src.displayName} as a custom connector](${claudeLink}), then choose **Connect** and sign in.

### Claude Code

\`\`\`
/plugin marketplace add ${repo}
/plugin install ${src.name}@${src.marketplace}
\`\`\`

This also adds the Zoeki Coach agent. For the connection alone:

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
