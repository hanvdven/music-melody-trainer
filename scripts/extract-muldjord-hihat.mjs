// #1091 round 3 (Han 2026-08-19, "for hh percussion, take the different samples from the hh-closed in
// the muldjordKit - assume the velocities are linearly distributed across the samples"): one-time copy
// of the MuldjordKit's 29 velocity-layered HihatClosed WAV files into this app's local samples dir, so
// they can be humanized (velocity-window sample pick, see drumKits.js `humanizePercussionSample`)
// instead of the old velocity-blind uniform-random pick among 7 unlabeled FreePats variants.
//
// Scope: HihatClosed ONLY (Han's explicit ask + interview answer — the rest of MuldjordKit's 381MB,
// 19 instrument folders, is a separate future ticket, same split as the earlier FreePats import).
//
// Verified against the kit's own MuldjordKit 20201018.sfz: sample 1 sits in the LOWEST lovel/hivel
// group, sample 29 in the HIGHEST — i.e. the numbering already IS low-to-high velocity, confirming
// "linearly distributed" is a safe assumption without parsing the SFZ's own (round-robin-shuffled)
// velocity groups. Not part of the app bundle/runtime — a dev-only build step, run manually.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'src/assets/ASSET DROP/MuldjordKit SFZ+WAV-20201018/samples/HihatClosed');
const OUT_DIR = path.join(ROOT, 'public/samples/Percussion/HihatClosedMuldjord');

export const MULDJORD_HIHAT_CLOSED_SAMPLE_COUNT = 29;

fs.mkdirSync(OUT_DIR, { recursive: true });
let copied = 0;
for (let i = 1; i <= MULDJORD_HIHAT_CLOSED_SAMPLE_COUNT; i++) {
    const srcPath = path.join(SRC_DIR, `${i}-HihatClosed.wav`);
    const outPath = path.join(OUT_DIR, `${i}.wav`);
    fs.copyFileSync(srcPath, outPath);
    copied++;
}

console.log(`Copied ${copied} HihatClosed samples to ${OUT_DIR}`);
