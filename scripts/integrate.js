const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { execSync } = require('child_process');
const { Octokit } = require('@octokit/rest');

// GitHub token (optional, but recommended for higher rate limits)
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';

const octokit = new Octokit({
  auth: GITHUB_TOKEN,
  userAgent: 'OnRoadNow-IntegrationAgent v1.0.0'
});

// Keywords to search for
const KEYWORDS = [
  'trading bot', 'crypto trading', 'stock trading', 'algorithmic trading',
  'monero miner', 'xmrig', 'p2pool', 'mining dashboard',
  'portfolio tracker', 'crypto dashboard', 'tradingview chart',
  'zerodha clone', 'binance clone', 'kraken clone'
];

// Target directories
const TARGET_DIR = path.join(__dirname, '../public');
const API_DIR = path.join(__dirname, '../api');

// Known repositories (fallback if search fails)
const FALLBACK_REPOS = [
  'https://github.com/jbfx1/FLUX-TRADE-.git',
  'https://github.com/manan2324/Finex-a-Zerodha-Clone.git',
  'https://github.com/dhatfieldai/trading-assist.git',
  'https://github.com/gupax-io/gupax.git',
  'https://github.com/hundehausen/monero-suite.git',
  'https://github.com/jesse-ai/jesse.git',
  'https://github.com/MoneroOcean/nodejs-pool.git'
];

// Integration adapters
const adapters = {
  'react': (repoPath, pageName) => {
    // Extract React components and create a simple HTML page with CDN
    const files = fs.readdirSync(repoPath);
    const srcFiles = files.filter(f => f.endsWith('.js') || f.endsWith('.jsx') || f.endsWith('.tsx'));
    if (srcFiles.length === 0) return null;
    // For simplicity, create a basic HTML page with a link to the React app
    return `
      <!DOCTYPE html>
      <html>
      <head><meta charset="UTF-8"><title>${pageName}</title>
      <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
      <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
      </head>
      <body>
        <div id="root"></div>
        <script>
          // Load the React app from the repo (in production, you'd build it)
          fetch('/api/proxy/${pageName}/bundle.js')
            .then(r => r.text())
            .then(js => eval(js));
        </script>
      </body>
      </html>
    `;
  },
  'node': (repoPath, pageName) => {
    // Extract Node.js endpoints and integrate into api/index.js
    const files = fs.readdirSync(repoPath);
    const jsFiles = files.filter(f => f.endsWith('.js'));
    // Look for routes or server files
    const routeFile = jsFiles.find(f => f.includes('route') || f.includes('server'));
    if (routeFile) {
      const content = fs.readFileSync(path.join(repoPath, routeFile), 'utf8');
      // Extract GET/POST handlers and append to api/index.js
      // This is simplified; in reality we'd parse the AST
      return content;
    }
    return null;
  },
  'python': (repoPath, pageName) => {
    // For Python projects, we'd run them separately or use a proxy
    // We'll just create a page that fetches data from the Python API if available
    return `
      <!DOCTYPE html>
      <html>
      <head><meta charset="UTF-8"><title>${pageName}</title></head>
      <body>
        <h1>${pageName}</h1>
        <p>Python backend integration pending.</p>
        <pre id="output">Loading...</pre>
        <script>
          fetch('/api/proxy/${pageName}')
            .then(r => r.json())
            .then(data => document.getElementById('output').textContent = JSON.stringify(data, null, 2));
        </script>
      </body>
      </html>
    `;
  }
};

async function searchRepositories(keyword) {
  try {
    const response = await octokit.search.repos({
      q: keyword,
      sort: 'stars',
      per_page: 5
    });
    return response.data.items.map(item => item.clone_url);
  } catch (e) {
    console.error('GitHub search failed:', e.message);
    return FALLBACK_REPOS;
  }
}

async function cloneAndIntegrate(repoUrl, pageName) {
  const repoPath = path.join(__dirname, '../temp', path.basename(repoUrl, '.git'));
  if (fs.existsSync(repoPath)) {
    console.log(`Updating ${repoUrl}...`);
    execSync(`cd ${repoPath} && git pull`, { stdio: 'inherit' });
  } else {
    console.log(`Cloning ${repoUrl}...`);
    execSync(`git clone ${repoUrl} ${repoPath}`, { stdio: 'inherit' });
  }

  // Detect language
  const packageJson = path.join(repoPath, 'package.json');
  let language = 'node';
  if (fs.existsSync(packageJson)) {
    language = 'node';
  } else if (fs.existsSync(path.join(repoPath, 'requirements.txt'))) {
    language = 'python';
  } else if (fs.existsSync(path.join(repoPath, 'Cargo.toml'))) {
    language = 'rust';
  }

  const adapter = adapters[language] || adapters['node'];
  const content = adapter(repoPath, pageName);
  if (content) {
    const pagePath = path.join(TARGET_DIR, `${pageName}.html`);
    fs.writeFileSync(pagePath, content);
    console.log(`✅ Integrated ${pageName} from ${repoUrl}`);
  } else {
    console.log(`⚠️ No integration for ${repoUrl}`);
  }
}

async function run() {
  console.log('🤖 Integration Agent started...');
  const repos = [];
  for (const kw of KEYWORDS) {
    const results = await searchRepositories(kw);
    repos.push(...results.slice(0, 2));
  }
  const uniqueRepos = [...new Set(repos)];
  console.log(`Found ${uniqueRepos.length} unique repositories.`);

  // Use fallback if no repos found
  if (uniqueRepos.length === 0) {
    uniqueRepos.push(...FALLBACK_REPOS);
  }

  // Limit to top 5 to avoid overwhelming
  const toIntegrate = uniqueRepos.slice(0, 5);
  for (const repo of toIntegrate) {
    const pageName = repo.split('/').pop().replace('.git', '');
    await cloneAndIntegrate(repo, pageName);
  }

  console.log('✅ Integration complete.');
}

run();
