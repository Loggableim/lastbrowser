/**
 * HermesBrowser — Git Integration Manager
 * Analyze repos, branches, diffs, and changelogs.
 */
const store = require('../database/store');
const { uid } = require('../../shared/constants');
const { execSync } = require('child_process');

const COLLECTION = 'git_repos';

function getAll() { return store.readCollection(COLLECTION); }

function getById(id) { return store.findOne(COLLECTION, r => r.id === id); }

function create(data) {
  const repo = {
    id: uid(),
    name: data.name || 'New Repo',
    localPath: data.localPath || '',
    remoteUrl: data.remoteUrl || '',
    defaultBranch: data.defaultBranch || 'main',
    currentBranch: '',
    lastCommitHash: null,
    createdAt: new Date().toISOString(),
  };
  const result = store.insert(COLLECTION, repo);
  refresh(repo.id);
  return getById(repo.id);
}

function update(id, changes) { return store.updateById(COLLECTION, id, changes); }

function remove(id) { return store.removeById(COLLECTION, id); }

function _git(cmd, repoPath) {
  try {
    return execSync(`git -C "${repoPath}" ${cmd}`, {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (err) {
    return { error: err.message, stdout: err.stdout?.trim() || '', stderr: err.stderr?.trim() || '' };
  }
}

function refresh(repoId) {
  const repo = getById(repoId);
  if (!repo || !repo.localPath) return null;
  const branch = _git('rev-parse --abbrev-ref HEAD', repo.localPath);
  const hash = _git('rev-parse HEAD', repo.localPath);
  const updates = {};
  if (typeof branch === 'string' && !branch.error) updates.currentBranch = branch;
  if (typeof hash === 'string' && !hash.error) updates.lastCommitHash = hash;
  return store.updateById(COLLECTION, repoId, updates);
}

function getStatus(repoId) {
  const repo = getById(repoId);
  if (!repo || !repo.localPath) return { error: 'Repo not found or no path set' };
  const status = _git('status --porcelain', repo.localPath);
  if (status.error) return { error: status.error };
  const lines = typeof status === 'string' ? status.split('\n').filter(l => l.trim()) : [];
  const staged = lines.filter(l => l[0] !== ' ' && l[0] !== '?');
  const unstaged = lines.filter(l => l[0] === ' ');
  const untracked = lines.filter(l => l.startsWith('??'));
  const branch = _git('rev-parse --abbrev-ref HEAD', repo.localPath);
  return {
    clean: lines.length === 0,
    staged: staged.length,
    unstaged: unstaged.length,
    untracked: untracked.length,
    total: lines.length,
    branch: typeof branch === 'string' && !branch.error ? branch : 'unknown',
  };
}

function getBranches(repoId) {
  const repo = getById(repoId);
  if (!repo || !repo.localPath) return [];
  const branches = _git('branch -a', repo.localPath);
  if (branches.error) return [];
  return (typeof branches === 'string' ? branches : '')
    .split('\n')
    .filter(b => b.trim())
    .map(b => ({
      name: b.replace('*', '').trim(),
      isCurrent: b.trim().startsWith('*'),
      isRemote: b.includes('remotes/'),
    }));
}

function createBranch(repoId, branchName, baseBranch) {
  const repo = getById(repoId);
  if (!repo || !repo.localPath) return { error: 'Repo not found' };
  if (baseBranch) {
    const r = _git(`checkout ${baseBranch}`, repo.localPath);
    if (r.error) return r;
  }
  const r = _git(`checkout -b ${branchName}`, repo.localPath);
  refresh(repoId);
  return r;
}

function getDiff(repoId, base, head) {
  const repo = getById(repoId);
  if (!repo || !repo.localPath) return '';
  const range = base ? (head ? `${base}..${head}` : base) : 'HEAD';
  const diff = _git(`diff ${range}`, repo.localPath);
  return typeof diff === 'string' ? diff : diff.error || '';
}

function getLog(repoId, maxCount = 20) {
  const repo = getById(repoId);
  if (!repo || !repo.localPath) return [];
  const log = _git(`log --oneline --max-count=${maxCount} --format="%H|%an|%ai|%s"`, repo.localPath);
  if (log.error) return [];
  return (typeof log === 'string' ? log : '')
    .split('\n')
    .filter(l => l.trim())
    .map(l => {
      const [hash, author, date, ...msgParts] = l.split('|');
      return { hash: hash?.slice(0, 8) || '', fullHash: hash || '', author: author || '', date: date || '', message: msgParts.join('|') || '' };
    });
}

function prepareCommit(repoId, message) {
  const repo = getById(repoId);
  if (!repo || !repo.localPath) return { error: 'Repo not found' };
  _git('add -A', repo.localPath);
  const r = _git(`commit -m "${message.replace(/"/g, '\\"')}"`, repo.localPath);
  refresh(repoId);
  return typeof r === 'string' ? { success: true, output: r } : r;
}

function getChangelog(repoId, fromTag, toTag) {
  const repo = getById(repoId);
  if (!repo || !repo.localPath) return '';
  const range = fromTag ? (toTag ? `${fromTag}..${toTag}` : `${fromTag}..HEAD`) : 'HEAD';
  const log = _git(`log ${range} --format="- %s (%an)"`, repo.localPath);
  return typeof log === 'string' ? log : log.error || '';
}

module.exports = { getAll, getById, create, update, remove, refresh,
  getStatus, getBranches, createBranch, getDiff, getLog, prepareCommit, getChangelog };
