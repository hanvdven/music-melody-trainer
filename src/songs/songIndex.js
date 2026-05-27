import defaultExercise from './definitions/defaultExercise.js';
import happyBirthday from './definitions/happyBirthday.js';

// Central registry of all available songs.
// Each entry is a song definition object (see definitions/*.js for the schema).
const SONGS = [
  defaultExercise,
  happyBirthday,
];

export default SONGS;
