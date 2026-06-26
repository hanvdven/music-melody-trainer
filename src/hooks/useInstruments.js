import { useState, useEffect, useRef } from 'react';
import { Soundfont, Reverb, DrumMachine, Sampler, getDrumMachineNames } from 'smplr';
import InstrumentSettings from '../model/InstrumentSettings';
import { LOCAL_PERCUSSION_BUFFERS } from '../audio/drumKits';
import { LOCAL_INSTRUMENT_BUFFERS } from '../audio/localInstruments';
import logger from '../utils/logger';

const VALID_DRUM_KITS = new Set(getDrumMachineNames());

const useInstruments = (context) => {
  // Settings
  const [trebleSettings, setTrebleSettings] = useState(
    InstrumentSettings.defaultTrebleInstrumentSettings()
  );
  const [bassSettings, setBassSettings] = useState(
    InstrumentSettings.defaultBassInstrumentSettings()
  );
  const [percussionSettings, setPercussionSettings] = useState(
    InstrumentSettings.defaultPercussionInstrumentSettings()
  );
  const [metronomeSettings, setMetronomeSettings] = useState(
    InstrumentSettings.defaultMetronomeInstrumentSettings()
  );
  const [chordSettings, setChordSettings] = useState(
    InstrumentSettings.defaultChordInstrumentSettings()
  );

  // Track the loaded slug per type so we can skip recreation when nothing changed
  const slugsRef = useRef({ treble: null, bass: null, percussion: null, metronome: null, chords: null });
  const instancesRef = useRef({ treble: null, bass: null, percussion: null, metronome: null, chords: null });
  const manualInstancesRef = useRef({ treble: null, bass: null, percussion: null, metronome: null, chords: null });
  const fadersRef = useRef({ treble: null, bass: null, percussion: null, metronome: null, chords: null });

  const [treble, setTreble] = useState(null);
  const [bass, setBass] = useState(null);
  const [percussion, setPercussion] = useState(null);
  const [metronome, setMetronome] = useState(null);
  const [chords, setChords] = useState(null);

  const [manualTreble, setManualTreble] = useState(null);
  const [manualBass, setManualBass] = useState(null);
  const [manualPercussion, setManualPercussion] = useState(null);
  const [manualMetronome, setManualMetronome] = useState(null);

  useEffect(() => {
    if (!context) return;

    // Initialize faders if they don't exist
    ['treble', 'bass', 'percussion', 'metronome', 'chords'].forEach(type => {
      if (!fadersRef.current[type]) {
        const gain = context.createGain();
        gain.connect(context.destination);
        fadersRef.current[type] = gain;
      }
    });

    // Helper to only recreate if slug changes
    const updateInstrument = (type, settings, setter, manualSetter = null, Effect = null, effectMix = 0) => {
      if (slugsRef.current[type] === settings.instrument) return; // Already loaded

      const current = instancesRef.current[type];
      const currentManual = manualInstancesRef.current[type];
      if (current) { try { current.stop(); } catch { /* may not be started */ } }
      if (currentManual) { try { currentManual.stop(); } catch { /* may not be started */ } }

      let newInst, newManualInst;
      try {
        const dest = fadersRef.current[type];
        if (type === 'percussion') {
          const isGMKit = ['standard', 'electronic', 'jazz'].includes(settings.instrument);
          const isLocalKit = settings.instrument === 'FreePats Percussion';

          if (isLocalKit) {
            const percSamplerOpts = { destination: dest, buffers: LOCAL_PERCUSSION_BUFFERS, detune: 0, decayTime: 0.3, lpfCutoffHz: 20000 };
            newInst = new Sampler(context, percSamplerOpts);
            newManualInst = new Sampler(context, { ...percSamplerOpts, destination: context.destination });
          } else if (isGMKit) {
            newInst = new Soundfont(context, { instrument: settings.instrument, destination: dest, disableScheduler: true });
            newManualInst = new Soundfont(context, { instrument: settings.instrument, destination: context.destination, disableScheduler: true });
          } else {
            if (!VALID_DRUM_KITS.has(settings.instrument)) {
              logger.warn('useInstruments', `Invalid drum kit: "${settings.instrument}".`);
              return;
            }
            newInst = new DrumMachine(context, { instrument: settings.instrument, destination: dest, disableScheduler: true });
            newManualInst = new DrumMachine(context, { instrument: settings.instrument, destination: context.destination, disableScheduler: true });
          }
        } else {
          // Use local FLAC samples when available (avoids CDN dependency for default instruments).
          // Falls back to smplr Soundfont (CDN) for any slug not in the local map.
          //
          // smplr 0.20.0 bug: samplerToSmplrJson includes `defaults: { detune: options.detune }`
          // in the generated JSON. When options.detune is undefined, it overrides PARAM_DEFAULTS.detune=0
          // with undefined during resolveParams, producing NaN → "non-finite AudioParam" TypeError.
          // Passing explicit 0 values here prevents undefined from reaching PARAM_DEFAULTS overrides.
          const SAMPLER_SAFE_DEFAULTS = { detune: 0, decayTime: 0.3, lpfCutoffHz: 20000 };
          const localBuffers = LOCAL_INSTRUMENT_BUFFERS[settings.instrument];
          if (localBuffers) {
            newInst = new Sampler(context, { destination: dest, buffers: localBuffers, ...SAMPLER_SAFE_DEFAULTS });
            newManualInst = new Sampler(context, { destination: context.destination, buffers: localBuffers, ...SAMPLER_SAFE_DEFAULTS });
          } else {
            newInst = new Soundfont(context, { instrument: settings.instrument, destination: dest });
            newManualInst = new Soundfont(context, { instrument: settings.instrument, destination: context.destination });
          }
        }
      } catch (e) {
        logger.error('useInstruments', 'E011-INSTRUMENT-CREATE', e, { instrument: settings.instrument });
        return;
      }

      if (Effect) {
        newInst.output.addEffect('reverb', new Effect(context), effectMix);
        newManualInst.output.addEffect('reverb', new Effect(context), effectMix);
      }

      slugsRef.current[type] = settings.instrument;
      instancesRef.current[type] = newInst;
      manualInstancesRef.current[type] = newManualInst;
      setter(newInst);
      if (manualSetter) manualSetter(newManualInst);
    };

    updateInstrument('treble', trebleSettings, setTreble, setManualTreble, Reverb, 0.1);
    updateInstrument('bass', bassSettings, setBass, setManualBass);
    updateInstrument('percussion', percussionSettings, setPercussion, setManualPercussion);
    updateInstrument('chords', chordSettings, setChords, null, Reverb, 0.15);
    updateInstrument('metronome', metronomeSettings, setMetronome, setManualMetronome);

  // Only the instrument name (`.instrument`) is a dep — intentionally narrow to avoid
  // re-creating smplr instances on every settings change (e.g. volume, reverb).
  // ESLint flags the full objects (bassSettings etc.) but the full objects are not needed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context,
    trebleSettings.instrument,
    bassSettings.instrument,
    percussionSettings.instrument,
    metronomeSettings.instrument,
    chordSettings.instrument
  ]);

  const setVolume = (type, volume, time = null) => {
    const fader = fadersRef.current[type];
    if (fader && context) {
      const targetTime = time || context.currentTime;
      // Smooth transition to avoid clicks
      fader.gain.setTargetAtTime(volume, targetTime, 0.05);
    }
  };

  return {
    instruments: { treble, bass, percussion, metronome, chords },
    manualInstruments: { treble: manualTreble, bass: manualBass, percussion: manualPercussion, metronome: manualMetronome },
    settings: {
      treble: [trebleSettings, setTrebleSettings],
      bass: [bassSettings, setBassSettings],
      percussion: [percussionSettings, setPercussionSettings],
      metronome: [metronomeSettings, setMetronomeSettings],
      chords: [chordSettings, setChordSettings],
    },
    setVolume,
  };
};

export default useInstruments;
