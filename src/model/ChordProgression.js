import Chord from './Chord';

/**
 * Represents a sequence of chords with associated generation metadata.
 */
class ChordProgression {
    /**
     * @param {Chord[]} chords - The actual chord objects
     * @param {string} complexity - 'triad', 'seventh', 'extended', etc.
     * @param {string} type - 'modal-random', 'ii-v-i', 'pop-1-5-6-4', etc.
     * @param {string} modality - 'modal', 'intra-modal', 'extra-modal'
     */
    constructor(chords = [], complexity = 'triad', type = 'classical-1-4-5-1', modality = 'modal') {
        this.chords = chords;
        this.complexity = complexity;
        this.type = type;
        this.modality = modality;
    }

    /**
     * Creates a deep copy of the progression.
     * @returns {ChordProgression}
     */
    clone() {
        return new ChordProgression(
            this.chords.map(c => c instanceof Chord ? c.clone() : { ...c }),
            this.complexity,
            this.type,
            this.modality
        );
    }

    /**
     * Transposes the entire progression to a new scale.
     * @param {string[]} oldScaleNotes 
     * @param {string[]} newScaleNotes 
     * @returns {ChordProgression}
     */
    transposeToScale(oldScaleNotes, newScaleNotes) {
        const newChords = this.chords.map(chord => {
            if (chord instanceof Chord) {
                return chord.transposeToScale(oldScaleNotes, newScaleNotes);
            }
            return chord; // Fallback for plain objects
        });

        return new ChordProgression(
            newChords,
            this.complexity,
            this.type,
            this.modality
        );
    }

    /**
     * Static helper to create a default progression.
     * @returns {ChordProgression}
     */
    static default() {
        return new ChordProgression([], 'triad', 'classical-1-4-5-1', 'modal');
    }
}

export default ChordProgression;
