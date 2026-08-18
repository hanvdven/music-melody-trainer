// #869 (Han 2026-08-10/17, "hernoem bestandnamen als dat beter is; haal bijvoorbeeld lange namen weg
// (gandalfhardcore uit bestandnaam etc)"): one-time (re-runnable, but a no-op once done) migration that
// strips the "GandalfHardcore" brand token from every file/folder name under public/ and src/assets/ that
// carries it, git-mv'ing each in place. Casing/spacing convention of the REST of each name is left
// UNCHANGED (Han's own scoping decision, interview 2026-08-17: kebab-casing every name would additionally
// require rewriting every literal-SPACE regex in generate-bestiary-manifest.mjs — judged too large/risky
// for the value; brand-strip alone already resolves the original complaint).
//
// Renames are computed bottom-up (deepest path first) so a directory rename never invalidates an
// already-recorded descendant path — each git-mv only ever touches the LAST path segment, in place.
//
// Run with: node scripts/rename-gandalfhardcore-assets.mjs
// After running: re-run scripts/generate-assorted-file-list.mjs and scripts/generate-bestiary-manifest.mjs
// (the two GENERATED manifests re-derive their ~1800 gandalfhardcore references automatically — never
// hand-edit those). Hand-written references (the ~101 regex/string literals in generate-bestiary-
// manifest.mjs and a handful of other files) are fixed separately, see docs/architecture.md §247.
import { readdirSync, statSync, existsSync, mkdirSync, rmdirSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

// Some pre-existing directories in this repo carry an ACL (inherited from however the original asset pack
// was extracted long ago) that denies RENAME/DELETE on the directory object itself to this process's
// account, even though renaming/moving the FILES inside it works fine (verified empirically: `git mv` on a
// file succeeds, `git mv`/`Rename-Item` on the directory fails with "Access is denied", but a FRESHLY
// created directory can be made/removed without issue). Workaround: create the new-named directory (fresh
// object, no inherited ACL problem), `git mv` each immediate child into it (recursing into this same
// workaround if a child subdirectory ALSO turns out to carry the restrictive ACL), then remove the
// now-empty old directory.
function moveDirWorkaround(oldDir, newDir) {
    mkdirSync(newDir, { recursive: true });
    for (const child of readdirSync(oldDir)) {
        const oldChild = join(oldDir, child);
        const newChild = join(newDir, child);
        try {
            execSync(`git mv -- "${oldChild}" "${newChild}"`, { stdio: 'pipe' });
        } catch {
            // child is itself a directory with the same restrictive ACL — recurse.
            moveDirWorkaround(oldChild, newChild);
        }
    }
    rmdirSync(oldDir);
}

const ROOTS = ['public/ASSORTED', 'src/assets'];

function stripBrand(name) {
    return name.replace(/gandalfhardcore/gi, '').replace(/\s{2,}/g, ' ').trim();
}

function collectMatches(root) {
    const matches = [];
    function walk(dir) {
        for (const entry of readdirSync(dir)) {
            const full = join(dir, entry);
            let st;
            try { st = statSync(full); } catch { continue; }   // dangling symlink or similar — skip
            if (st.isDirectory()) walk(full);
            if (/gandalfhardcore/i.test(entry)) matches.push(full);
        }
    }
    if (existsSync(root)) walk(root);
    return matches;
}

const allMatches = ROOTS.flatMap(collectMatches);
// Deepest first (most path separators) — see header comment for why this ordering is required.
allMatches.sort((a, b) => b.split(/[\\/]/).length - a.split(/[\\/]/).length);

console.log(`Found ${allMatches.length} paths containing "gandalfhardcore".`);
const dryRun = process.argv.includes('--dry-run');

let renamed = 0;
for (const oldPath of allMatches) {
    const parts = oldPath.split(/[\\/]/);
    const oldBase = parts[parts.length - 1];
    const newBase = stripBrand(oldBase);
    if (!newBase || newBase === oldBase) {
        console.warn(`  SKIP (empty/unchanged result): ${oldPath}`);
        continue;
    }
    parts[parts.length - 1] = newBase;
    const newPath = parts.join('/');
    if (existsSync(newPath)) {
        console.warn(`  SKIP (target already exists): ${oldPath} -> ${newPath}`);
        continue;
    }
    if (dryRun) {
        console.log(`  ${oldPath}  ->  ${newPath}`);
    } else {
        try {
            execSync(`git mv -- "${oldPath}" "${newPath}"`, { stdio: 'pipe' });
        } catch {
            console.log(`  (ACL workaround) ${oldPath}  ->  ${newPath}`);
            moveDirWorkaround(oldPath, newPath);
        }
    }
    renamed++;
}

console.log(`${dryRun ? 'Would rename' : 'Renamed'} ${renamed}/${allMatches.length} paths.`);
