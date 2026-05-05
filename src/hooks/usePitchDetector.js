// hooks/usePitchDetector.js
//
// Dual-mode pitch detector using the Web Audio API (no external deps).
//
// NOTE mode  — autocorrelation on time-domain buffer → Hz → MIDI → note + cents
// CHORD mode — FFT → per-pitch-class energy (chromagram) → active pitch classes
//              caller is responsible for chord recognition from pitch classes.
//
// Usage:
//   const { detectedNote, detectedHz, centsOff,
//           activePitchClasses, isListening,
//           startListening, stopListening, error } = usePitchDetector(audioContext, mode);
//
// mode: 'note' | 'chord'
// audioContext: existing AudioContext from App (avoids creating a second one)

import { useRef, useState, useCallback, useEffect } from 'react';
import logger from '../utils/logger';

// --- Pitch-class names (canonical) ---
const PC_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

// Convert frequency in Hz to the nearest MIDI note number (float, with fractional cents info)
function hzToMidi(hz) {
    return 69 + 12 * Math.log2(hz / 440);
}

// Convert MIDI note number to note name + octave, e.g.  60 → { name: 'C', octave: 4 }
function midiToNoteName(midi) {
    const clamped = Math.max(0, Math.min(127, Math.round(midi)));
    const pc = ((clamped % 12) + 12) % 12;
    const octave = Math.floor(clamped / 12) - 1;
    return { name: PC_NAMES[pc], octave, midi: clamped };
}

// ─────────────────────────────────────────────────────────────────────────────
// NOTE MODE — autocorrelation-based monophonic pitch detection
// ─────────────────────────────────────────────────────────────────────────────
const CORR_BUF_SIZE = 2048;

function detectPitchAutocorr(timeDomainData, sampleRate) {
    const buf = timeDomainData;
    const size = buf.length;

    // RMS silence gate
    let rms = 0;
    for (let i = 0; i < size; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / size);
    if (rms < 0.008) return null; // silence

    // Autocorrelation
    const corr = new Float32Array(size);
    for (let lag = 0; lag < size; lag++) {
        let s = 0;
        for (let i = 0; i < size - lag; i++) s += buf[i] * buf[i + lag];
        corr[lag] = s;
    }

    // Find first local minimum (after initial peak), then first subsequent maximum
    let d = 0;
    while (d < size && corr[d] > corr[d + 1]) d++;     // descend from [0]
    let maxVal = -Infinity, maxLag = -1;
    for (let i = d; i < size; i++) {
        if (corr[i] > maxVal) { maxVal = corr[i]; maxLag = i; }
    }
    if (maxLag === -1 || corr[maxLag] < 0.01 * corr[0]) return null;

    // Parabolic interpolation for sub-sample accuracy
    const y0 = corr[Math.max(0, maxLag - 1)];
    const y1 = corr[maxLag];
    const y2 = corr[Math.min(size - 1, maxLag + 1)];
    const refinedLag = maxLag - (y2 - y0) / (2 * (2 * y1 - y0 - y2));
    if (refinedLag <= 0) return null;

    const hz = sampleRate / refinedLag;
    if (hz < 60 || hz > 4200) return null; // outside piano+voice range
    return hz;
}

// ─────────────────────────────────────────────────────────────────────────────
// CHORD MODE — FFT chromagram
// ─────────────────────────────────────────────────────────────────────────────
const FFT_SIZE = 4096;
const CHROMA_THRESHOLD_DB = -55; // bins below this level (dBFS) are ignored

function buildChromagram(freqDataDb, sampleRate, fftSize) {
    const chroma = new Float32Array(12);
    const binHz = sampleRate / fftSize;
    const numBins = freqDataDb.length;

    for (let b = 1; b < numBins; b++) {
        const db = freqDataDb[b];
        if (db < CHROMA_THRESHOLD_DB) continue;

        const hz = b * binHz;
        if (hz < 50 || hz > 5000) continue;

        const midi = hzToMidi(hz);
        const pc = ((Math.round(midi) % 12) + 12) % 12;

        // Weight by linear magnitude (convert from dB)
        const mag = Math.pow(10, db / 20);
        chroma[pc] += mag;
    }

    // Normalize to [0, 1]
    const maxVal = Math.max(...chroma);
    if (maxVal <= 0) return null;
    const normalized = chroma.map(v => v / maxVal);
    return normalized;
}

// Given a chroma vector, return active pitch class indices above a relative threshold
function activePitchClassesFromChroma(chroma, relThreshold = 0.35) {
    if (!chroma) return [];
    const maxVal = Math.max(...chroma);
    if (maxVal <= 0) return [];
    const active = [];
    for (let i = 0; i < 12; i++) {
        if (chroma[i] / maxVal >= relThreshold) active.push(i);
    }
    return active;
}

// ─────────────────────────────────────────────────────────────────────────────
// HOOK
// ─────────────────────────────────────────────────────────────────────────────
export default function usePitchDetector(audioContext, mode = 'note') {
    const [isListening, setIsListening] = useState(false);
    const [detectedNote, setDetectedNote] = useState(null);   // { name, octave, midi }
    const [detectedHz, setDetectedHz] = useState(null);
    const [centsOff, setCentsOff] = useState(0);        // −50 … +50
    const [activePitchClasses, setActivePitchClasses] = useState([]); // chord mode: [0..11]
    const [error, setError] = useState(null);

    const streamRef = useRef(null);
    const sourceRef = useRef(null);
    const analyserRef = useRef(null);
    const rafRef = useRef(null);
    const modeRef = useRef(mode);

    // Keep modeRef in sync so the rAF loop always uses the current mode
    useEffect(() => { modeRef.current = mode; }, [mode]);

    // ── analysis loop ─────────────────────────────────────────────────────────
    const startLoop = useCallback((analyser, sampleRate) => {
        const corrBuf = new Float32Array(CORR_BUF_SIZE);
        const fftBuf = new Float32Array(analyser.frequencyBinCount);

        const tick = () => {
            rafRef.current = requestAnimationFrame(tick);

            if (modeRef.current === 'note') {
                analyser.fftSize = CORR_BUF_SIZE;
                analyser.getFloatTimeDomainData(corrBuf);
                const hz = detectPitchAutocorr(corrBuf, sampleRate);

                if (hz === null) {
                    setDetectedNote(null);
                    setDetectedHz(null);
                    setCentsOff(0);
                    return;
                }

                const midiFloat = hzToMidi(hz);
                const midiRound = Math.round(midiFloat);
                const cents = Math.round((midiFloat - midiRound) * 100);
                const noteInfo = midiToNoteName(midiRound);

                setDetectedHz(Math.round(hz));
                setCentsOff(cents);
                setDetectedNote(noteInfo);
            } else {
                // chord mode
                analyser.fftSize = FFT_SIZE;
                analyser.getFloatFrequencyData(fftBuf);
                const chroma = buildChromagram(fftBuf, sampleRate, FFT_SIZE);
                const active = activePitchClassesFromChroma(chroma);
                setActivePitchClasses(active);
            }
        };

        rafRef.current = requestAnimationFrame(tick);
    }, []);

    // ── startListening ────────────────────────────────────────────────────────
    const startListening = useCallback(async () => {
        if (!audioContext) return;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            streamRef.current = stream;

            const source = audioContext.createMediaStreamSource(stream);
            const analyser = audioContext.createAnalyser();
            analyser.smoothingTimeConstant = modeRef.current === 'chord' ? 0.8 : 0.5;

            source.connect(analyser);
            // Do NOT connect to audioContext.destination to avoid mic feedback
            sourceRef.current = source;
            analyserRef.current = analyser;

            setError(null);
            setIsListening(true);
            startLoop(analyser, audioContext.sampleRate);
        } catch (err) {
            const msg = err.name === 'NotAllowedError'
                ? 'Microphone permission denied. Please allow microphone access and try again.'
                : `Microphone error: ${err.message}`;
            setError(msg);
            logger.error('usePitchDetector', 'E014-GET-USER-MEDIA', err);
        }
    }, [audioContext, startLoop]);

    // ── stopListening ─────────────────────────────────────────────────────────
    const stopListening = useCallback(() => {
        if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
        sourceRef.current?.disconnect();
        streamRef.current?.getTracks().forEach(t => t.stop());
        sourceRef.current = null;
        analyserRef.current = null;
        streamRef.current = null;

        setIsListening(false);
        setDetectedNote(null);
        setDetectedHz(null);
        setCentsOff(0);
        setActivePitchClasses([]);
    }, []);

    // Cleanup on unmount
    useEffect(() => () => stopListening(), [stopListening]);

    // When mode changes while listening, update analyser smoothing
    useEffect(() => {
        if (!analyserRef.current) return;
        analyserRef.current.smoothingTimeConstant = mode === 'chord' ? 0.8 : 0.5;
    }, [mode]);

    return {
        isListening,
        detectedNote,
        detectedHz,
        centsOff,
        activePitchClasses,
        error,
        startListening,
        stopListening,
        PC_NAMES, // export for convenience
    };
}
