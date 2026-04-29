
import { getNoteIndex, transposeNoteBySemitones, transposeMelodyToScale } from '../theory/musicUtils';

class Chord {
    /**
     * @param {string} root - The root note (e.g., "C4")
     * @param {string} type - The chord type (e.g., "major", "minor", "diminished")
     * @param {string[]} notes - Validation: Array of notes (e.g., ["C4", "E4", "G4"])
     * @param {string} name - Optional display name
     * @param {string} [internalRoot] - Root without octave for display
     * @param {string} [internalSuffix] - Suffix for display (e.g., "maj7", "-7")
     * @param {string} [roman] - Roman numeral representation
     * @param {number[]} [intervals] - Array of semitone intervals from root
     * @param {number[]} [structure] - Array of scale-degree offsets (e.g., [0, 2, 4])
     * @param {object} [meta] - Generic metadata bucket
     */
    constructor(root, type, notes, name = '', internalRoot = '', internalSuffix = '', roman = '', intervals = [], structure = [], meta = {}) {
        this.root = root;
        this._displayRoot = internalRoot || null; // key-spelled root (e.g. G♭ not F♯)
        this.type = type;
        this.notes = notes || [];
        this.name = name || `${root.replace(/-?\d+$/, '')} ${type}`;

        // Additional metadata for display/UI, often set by chordGenerator
        this.internalSuffix = internalSuffix;
        this.roman = roman;
        this.intervals = intervals || [];
        this.structure = structure || [];
        this.meta = { ...meta }; // Ensure fresh object
    }

    clone() {
        return new Chord(
            this.root,
            this.type,
            [...this.notes],
            this.name,
            this.internalRoot,
            this.internalSuffix,
            this.roman,
            [...this.intervals],
            [...this.structure],
            { ...this.meta }
        );
    }

    /**
     * Returns the root note without its octave.
     * @returns {string}
     */
    get rootDisplay() {
        return this.root.replace(/-?\d+$/, '');
    }

    /**
     * Key-spelled root (e.g. G♭ in C Locrian, not F♯). Falls back to chromatic rootDisplay.
     * @returns {string}
     */
    get internalRoot() {
        return this._displayRoot || this.rootDisplay;
    }

    get quality() {
        return this.type;
    }

    get romanBaseRaw() {
        return this.meta.romanBaseRaw;
    }

    get romanBaseDisplay() {
        return this.meta.romanBaseDisplay;
    }

    get romanSuffix() {
        return this.meta.romanSuffix;
    }

    get category() {
        return this.meta.category;
    }

    get displayNotes() {
        return this.meta.displayNotes;
    }

    /**
     * Transposes the chord by a number of semitones.
     * @param {number} semitones 
     * @returns {Chord} A new Chord instance
     */
    transpose(semitones) {
        const newRoot = transposeNoteBySemitones(this.root, semitones);
        const newNotes = this.notes.map(n => transposeNoteBySemitones(n, semitones));

        // Recalculate internalRoot, preserve other metadata
        const newInternalRoot = newRoot.replace(/-?\d+$/, '');
        let newName = this.name;
        const oldRootPC = this.root.replace(/-?\d+$/, '');
        if (newName.includes(oldRootPC)) {
            newName = newName.replace(oldRootPC, newInternalRoot);
        }

        return new Chord(
            newRoot,
            this.type,
            newNotes,
            newName,
            newInternalRoot,
            this.internalSuffix,
            this.roman,
            [...this.intervals],
            [...this.structure],
            { ...this.meta }
        );
    }

    /**
     * Transposes the chord from one scale key to another using scale degree mapping.
     * @param {string[]} oldScaleNotes 
     * @param {string[]} newScaleNotes 
     * @returns {Chord} A new Chord instance
     */
    transposeToScale(oldScaleNotes, newScaleNotes) {
        // Transpose Root
        const newRootArr = transposeMelodyToScale([this.root], oldScaleNotes, newScaleNotes);
        const newRoot = newRootArr[0];

        // Transpose Notes
        const newNotes = transposeMelodyToScale(this.notes, oldScaleNotes, newScaleNotes);

        // Update name if it contains root note name
        const rootPC = this.root.replace(/\d+$/, '');
        const newRootPC = newRoot.replace(/\d+$/, '');
        let newName = this.name;
        if (newName.includes(rootPC)) {
            newName = newName.replace(rootPC, newRootPC);
        }

        // Create new chord, preserving metadata where possible
        // Note: If scale transposition changes chord quality (e.g., iii in major to III in minor),
        // internalSuffix and roman might become inaccurate. Re-analysis would be needed for full accuracy.
        return new Chord(
            newRoot,
            this.type,
            newNotes,
            newName,
            newRootPC,
            this.internalSuffix,
            this.roman,
            [...this.intervals],
            [...this.structure],
            { ...this.meta }
        );
    }

    toString() {
        return `Chord(${this.name}: ${this.notes.join(', ')})`;
    }
}

export default Chord;
