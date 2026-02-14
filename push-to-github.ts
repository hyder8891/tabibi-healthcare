import { Octokit } from "@octokit/rest";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings?.settings?.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? "depl " + process.env.WEB_REPL_RENEWAL
    : null;
  if (!xReplitToken) throw new Error("X_REPLIT_TOKEN not found");
  connectionSettings = await fetch(
    "https://" + hostname + "/api/v2/connection?include_secrets=true&connector_names=github",
    { headers: { Accept: "application/json", X_REPLIT_TOKEN: xReplitToken } }
  ).then((r) => r.json()).then((d) => d.items?.[0]);
  const accessToken = connectionSettings?.settings?.access_token || connectionSettings?.settings?.oauth?.credentials?.access_token;
  if (!accessToken) throw new Error("GitHub not connected");
  return accessToken;
}

async function getAllFiles(dir: string, base: string = ""): Promise<{ path: string; content: string }[]> {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: { path: string; content: string }[] = [];
  const ignoreDirs = new Set([".git", "node_modules", ".expo", ".cache", "dist", "static-build", ".local", "attached_assets"]);

  for (const entry of entries) {
    const relPath = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (!ignoreDirs.has(entry.name)) {
        files.push(...(await getAllFiles(path.join(dir, entry.name), relPath)));
      }
    } else {
      try {
        const content = fs.readFileSync(path.join(dir, entry.name));
        files.push({ path: relPath, content: content.toString("base64") });
      } catch {}
    }
  }
  return files;
}

async function main() {
  const token = await getAccessToken();
  const octokit = new Octokit({ auth: token });
  const owner = "hyder8891";
  const repo = "tabibi-healthcare";

  console.log("Collecting files...");
  const files = await getAllFiles("/home/runner/workspace");
  console.log(`Found ${files.length} files to push`);

  // Get the latest commit SHA on main (or default branch)
  let parentSha: string | undefined;
  let treeSha: string | undefined;
  try {
    const { data: ref } = await octokit.git.getRef({ owner, repo, ref: "heads/main" });
    parentSha = ref.object.sha;
    const { data: commit } = await octokit.git.getCommit({ owner, repo, commit_sha: parentSha });
    treeSha = commit.tree.sha;
    console.log(`Existing main branch at ${parentSha.substring(0, 7)}`);
  } catch {
    console.log("No existing main branch, creating fresh");
  }

  // Create blobs for all files
  console.log("Creating tree...");
  const treeItems: any[] = [];
  
  // Process in batches to avoid rate limits
  const batchSize = 50;
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    const blobPromises = batch.map(async (file) => {
      try {
        const { data: blob } = await octokit.git.createBlob({
          owner, repo,
          content: file.content,
          encoding: "base64",
        });
        return { path: file.path, mode: "100644" as const, type: "blob" as const, sha: blob.sha };
      } catch (e: any) {
        console.error(`Failed to create blob for ${file.path}: ${e.message}`);
        return null;
      }
    });
    const results = await Promise.all(blobPromises);
    treeItems.push(...results.filter(Boolean));
    console.log(`  Processed ${Math.min(i + batchSize, files.length)}/${files.length} files`);
  }

  // Create tree
  const { data: tree } = await octokit.git.createTree({
    owner, repo,
    tree: treeItems,
    ...(treeSha ? { base_tree: undefined } : {}),
  });
  console.log(`Tree created: ${tree.sha.substring(0, 7)}`);

  // Create commit  
  const commitMessage = "Production security hardening + auth fixes\n\n- Stateless Bearer token auth (jose JWKS)\n- AES-256-GCM encryption for sensitive DB fields\n- Worker Thread for rPPG processing\n- Google Maps API caching\n- Modular route controllers\n- Auth token injection for all API calls";
  
  const commitParams: any = {
    owner, repo,
    message: commitMessage,
    tree: tree.sha,
  };
  if (parentSha) commitParams.parents = [parentSha];

  const { data: commit } = await octokit.git.createCommit(commitParams);
  console.log(`Commit created: ${commit.sha.substring(0, 7)}`);

  // Update or create ref
  try {
    await octokit.git.updateRef({ owner, repo, ref: "heads/main", sha: commit.sha, force: true });
    console.log("Updated main branch");
  } catch {
    await octokit.git.createRef({ owner, repo, ref: "refs/heads/main", sha: commit.sha });
    console.log("Created main branch");
  }

  console.log(`\nDone! Code pushed to https://github.com/${owner}/${repo}`);
}

main().catch((e) => { console.error("Error:", e.message); process.exit(1); });
