import defaultExercise from './definitions/defaultExercise.js';
import happyBirthday from './definitions/happyBirthday.js';
import level1Intro from './definitions/level1-intro.js';
import level2Intro from './definitions/level2-intro.js';
import arirang from './definitions/arirang.js';
import frereJacques from './definitions/frere-jacques.js';
import kalinka from './definitions/kalinka.js';
import kangdingQingge from './definitions/kangding-qingge.js';
import laBamba from './definitions/la-bamba.js';
import sakura from './definitions/sakura.js';
import scarboroughFair from './definitions/scarborough-fair.js';

// Central registry of all available songs.
// Each entry is a song definition object (see definitions/*.js for the schema).
const SONGS = [
  defaultExercise,
  happyBirthday,
  level1Intro,
  level2Intro,
  arirang,
  frereJacques,
  kalinka,
  kangdingQingge,
  laBamba,
  sakura,
  scarboroughFair,
];

export default SONGS;
