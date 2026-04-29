// PlaybackSubComponents.jsx
// Small presentational components extracted from PlaybackSettings.jsx to keep
// that file focused on orchestration logic.
import React from 'react';
import { Disc, Dices, Pin } from 'lucide-react';
import GenericStepper from '../common/GenericStepper';
import './styles/PlaybackSubComponents.css';

// ─── SectionHeader ────────────────────────────────────────────────────────────
/** A grid-spanning section label (uppercase, muted) used between the major
 *  blocks inside PlaybackSettings (Song, Chords, Instruments, Visibility…). */
export const SectionHeader = ({ label, gridTemplateColumns }) => (
    <div
        className="section-header-row"
        style={{ display: 'grid', gridTemplateColumns: gridTemplateColumns || '12% 18% 12% 22% 12% 12% 12%' }}
    >
        <div className="section-header-label">{label}</div>
    </div>
);

// ─── StatusIcon ───────────────────────────────────────────────────────────────
/** Tiny inline icon indicating the current randomization mode. */
export const StatusIcon = ({ type }) => {
    if (type === 'wheel') return <Disc size={10} color="#888" className="status-icon" />;
    if (type === 'dice') return <Dices size={10} color="#888" className="status-icon" />;
    return <Pin size={10} color="#888" className="status-icon status-icon-pin" />;
};

// ─── ColumnHeaders ────────────────────────────────────────────────────────────
/** A single header row of labels positioned in a CSS grid. */
export const ColumnHeaders = ({ columns, gridConfig }) => (
    <div className="col-headers" style={{ display: 'grid', gridTemplateColumns: gridConfig }}>
        {columns.map((col, i) => (
            <div key={i}>{col}</div>
        ))}
    </div>
);

// ─── BracketHeader ────────────────────────────────────────────────────────────
/** A labelled bracket spanning two sub-columns (e.g. "ODD REPETITIONS"). */
export const BracketHeader = ({ label, subLeft, subRight }) => (
    <div className="bracket-header">
        <div className="bracket-header-label">{label}</div>
        <div className="bracket-header-bar" />
        <div className="bracket-header-subs">
            <span className="bracket-header-sub">{subLeft}</span>
            <span className="bracket-header-sub">{subRight}</span>
        </div>
    </div>
);

// ─── RepeatMeasureBar ─────────────────────────────────────────────────────────
/** Interactive bar showing measure count and repeat count with barline decorations. */
export const RepeatMeasureBar = ({ numMeasures = 16, reps = 1, musicalBlocks = [], onMeasuresChange, onRepsChange }) => (
    <div className="rmb-container">
        {/* Header Row */}
        <div className="rmb-header-row">
            <div className="rmb-header-measures">
                Measures {musicalBlocks && musicalBlocks.length > 1 && (
                    <span className="rmb-header-blocks">[{musicalBlocks.join('+')}]</span>
                )}
            </div>
            <div className="rmb-header-repeats">Repeats</div>
        </div>

        {/* Setter Row */}
        <div className="rmb-setter-row">
            {/* Start Repeat Sign */}
            <div className="rmb-sign-start">
                {reps > 1 ? (
                    <>
                        <div className="rmb-thick-line" />
                        <div className="rmb-thin-line rmb-thin-line-right" />
                        <div className="rmb-dots">
                            <div className="rmb-dot" /><div className="rmb-dot" />
                        </div>
                    </>
                ) : (
                    <div className="rmb-thin-line" />
                )}
            </div>

            {/* Measure Setter */}
            <div className="rmb-measure-setter">
                <GenericStepper value={numMeasures} min={1} max={32} onChange={onMeasuresChange} fontSize="15.5px" fontFamily="serif" height="100%" />
            </div>

            {/* Barlines Area */}
            <div className="rmb-barlines-area">
                {[...Array(Math.min(12, Math.max(1, (numMeasures || 1) - 1)))].map((_, i) => (
                    <div key={i} className="rmb-barline" />
                ))}
            </div>

            {/* Repeat Setter */}
            <div className="rmb-repeat-setter">
                <GenericStepper value={reps} min={1} max={16} onChange={onRepsChange} fontSize="15.5px" fontFamily="serif" height="100%" />
            </div>

            {/* End Repeat Sign */}
            <div className="rmb-sign-end">
                {reps > 1 ? (
                    <>
                        <div className="rmb-dots">
                            <div className="rmb-dot" /><div className="rmb-dot" />
                        </div>
                        <div className="rmb-thin-line rmb-thin-line-left" />
                        <div className="rmb-thick-line" />
                    </>
                ) : (
                    <div className="rmb-thin-line" />
                )}
            </div>
        </div>
    </div>
);
