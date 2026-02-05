// /components/SheetMusic.jsx

import React from 'react';
import { processMelodyAndCalculateSlots } from './processMelodyAndCalculateSlots';
import { processMelodyAndCalculateFlags } from './processMelodyAndCalculateFlags';

import { renderMelodyNotes } from './renderMelodyNotes';
import renderAccidentals from './renderAccidentals';
import calculateAllTimeStamps from './calculateAllTimeStamps';

import { getTempoTerm } from '../../utils/tempo';

const SheetMusic = ({
  timeSignature,
  onTimeSignatureChange,
  bpm,
  onBpmChange,
  trebleMelody,
  bassMelody,
  percussionMelody,
  numAccidentals,
  screenWidth,
  onRandomizeMeasure,
}) => {

  let noteGroupSize = 12;
  let measureLength = (48 * timeSignature[0]) / timeSignature[1];

  if (measureLength % 18 === 0) {
    noteGroupSize = 18;
  }

  const endX = screenWidth - 40;

  const staffLines = [
    11, 21, 31, 41, 51, 91, 101, 111, 121, 131, 171, 181, 191, 201, 211,
  ];

  // Measure
  const measurePositionX = Math.min(Math.abs(numAccidentals), 7) * 8 + 60;
  const startX = measurePositionX + 15;
  const [measureTop, measureBottom] = timeSignature;

  const measureYPositions = [20, 40, 100, 120, 180, 200]; // Define y positions

  // Bind handlers - we need a way to pass the *specific* click handler to the hook if we use a single hook instance.
  // Or we can just use the hook logic inline or create a new hook instance for each map iteration (not allowed).
  // Better: The hook should return a function that takes the onClick callback as an argument? 
  // Or just keep it simple: The hook manages the timer. The events we attach call the hook's methods.
  // The hook's onMouseUp calls the passed 'onClick' if it wasn't a long press.
  // BUT 'onClick' differs for each measure (though they all do incrementTop). 

  // Let's refactor useLongPress to take no args, but return state/methods, and let the caller decide what to do on 'click' detected by the hook.

  const useLongPressLogic = () => {
    const timerRef = React.useRef(null);
    const isLongPress = React.useRef(false);

    const start = (callback) => {
      isLongPress.current = false;
      timerRef.current = setTimeout(() => {
        isLongPress.current = true;
        if (callback) callback();
      }, 500);
    }

    const end = (e, onClick) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (!isLongPress.current && onClick) {
        onClick(e);
      }
    }

    const cancel = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }

    return { start, end, cancel };
  }

  const longPress = useLongPressLogic();

  const handleTopLongPress = () => {
    // Reset timer before prompt to keep numeric display active
    resetNumericTimer();
    // setTimeout to allow UI update before prompt blocks thread?
    setTimeout(() => {
      const input = window.prompt("Enter time signature top (1-32):", measureTop);
      if (input !== null) {
        wrapHandler('setTop', input);
      }
    }, 10);
  };

  // State for temporary numeric display
  const [showNumeric, setShowNumeric] = React.useState(false);
  const numericTimerRef = React.useRef(null);

  const resetNumericTimer = () => {
    setShowNumeric(true);
    if (numericTimerRef.current) {
      clearTimeout(numericTimerRef.current);
    }
    numericTimerRef.current = setTimeout(() => {
      setShowNumeric(false);
    }, 5000);
  };

  const wrapHandler = (handlerName, ...args) => {
    resetNumericTimer();
    onTimeSignatureChange(handlerName, ...args);
  };

  const renderMeasureTexts = () => {
    return measureYPositions.map((yPos, index) => {
      // shouldShowNumeric: controls whether 'C' is replaced by numbers.
      // Numbers are ALWAYS shown if not common time.
      const isCommonTime = (measureTop === 4 && measureBottom === 4) || (measureTop === 2 && measureBottom === 2);
      const displayNumeric = !isCommonTime || showNumeric;

      if (displayNumeric) {
        const isTop = index % 2 === 0;
        const rectWidth = 60;
        const halfWidth = rectWidth / 2;
        const rectX = measurePositionX - 30;

        // Adjust RectY to avoid overlap with BPM controls (which end at y=-5 relative to their group? No, BPM is above).
        // Measure Top is at yPos=20.
        // Old RectY = 20-30 = -10. Overlaps with BPM (-5).
        // New RectY = 20-25 = -5. No overlap.
        const rectY = isTop ? yPos - 25 : yPos - 10;
        const rectHeight = isTop ? 35 : 30;

        return (
          <g key={`measure-group-${index}`}>
            {/* Visual Indicators - Yellow +/-. Only show if showNumeric (active interaction) is true */}
            {showNumeric && (
              <>
                <text x={measurePositionX - 18} y={yPos + 2} className="measure-indicator">-</text>
                <text x={measurePositionX + 18} y={yPos + 4.5} className="measure-indicator">+</text>
              </>
            )}

            {/* Text Display */}
            <text
              x={measurePositionX}
              y={yPos + 1}
              fontSize="35"
              fill="var(--text-primary)"
              fontFamily="Maestro"
              textAnchor="middle"
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
              {isTop ? measureTop : measureBottom}
            </text>

            {/* Left Hitbox (Decrement / Cycle Backward) */}
            <rect
              x={rectX}
              y={rectY + 2}
              width={halfWidth}
              height={rectHeight}
              fill="transparent"
              style={{ cursor: 'pointer' }}
              onClick={() =>
                isTop
                  ? wrapHandler('decrementTop')
                  : wrapHandler('cycleBottomBackward')
              }
            />
            {/* Right Hitbox (Increment / Cycle Forward) */}
            <rect
              x={rectX + halfWidth}
              y={rectY + 2}
              width={halfWidth}
              height={rectHeight}
              fill="transparent"
              style={{ cursor: 'pointer' }}
              onMouseDown={(e) => {
                if (isTop) longPress.start(handleTopLongPress);
              }}
              onMouseUp={(e) => {
                if (isTop) {
                  longPress.end(e, () => wrapHandler('incrementTop'));
                } else {
                  wrapHandler('cycleBottom');
                }
              }}
              onMouseLeave={(e) => {
                if (isTop) longPress.cancel();
              }}
              onTouchStart={(e) => {
                if (isTop) longPress.start(handleTopLongPress);
              }}
              onTouchEnd={(e) => {
                e.preventDefault(); // Prevent duplicate mouse events
                if (isTop) {
                  longPress.end(e, () => wrapHandler('incrementTop'));
                } else {
                  wrapHandler('cycleBottom');
                }
              }}
            // Removed onClick to avoid confusion/duplication
            />
          </g>
        );
      } else if (index % 2 === 0) {
        // Rendering 'C' or 'c'
        return (
          <g key={`measure-group-${index}`}>
            <text
              x={measurePositionX}
              y={yPos + 10}
              fontSize="32"
              fill="var(--text-primary)"
              fontFamily="Maestro"
              textAnchor="middle"
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
              {measureTop === 2 ? 'C' : 'c'}
            </text>
            {/* Hitbox for C/c - Single click activates numeric mode */}
            <rect
              x={measurePositionX - 15}
              y={yPos - 15}
              width="30"
              height="40"
              fill="transparent"
              style={{ cursor: 'pointer' }}
              onClick={() => resetNumericTimer()}
            />
          </g>
        );
      } else {
        return null; // Render nothing for this yPos 
      }
    });
  };

  const adjustedTrebleMelody = processMelodyAndCalculateSlots(
    trebleMelody,
    timeSignature,
    noteGroupSize
  );

  const trebleMelodyFlags = processMelodyAndCalculateFlags(
    adjustedTrebleMelody,
    timeSignature,
    noteGroupSize
  );

  const adjustedBassMelody = processMelodyAndCalculateSlots(
    bassMelody,
    timeSignature,
    noteGroupSize
  );

  const adjustedPercussionMelody = processMelodyAndCalculateSlots(
    percussionMelody,
    timeSignature,
    noteGroupSize
  );

  const allTimeStamps = calculateAllTimeStamps(
    timeSignature,
    noteGroupSize,
    adjustedTrebleMelody.timeStamps,
    adjustedBassMelody.timeStamps,
    adjustedPercussionMelody.timeStamps
  );

  const noteWidth = (endX - startX) / (allTimeStamps.length - 1);

  // Function to render vertical lines at the end of each measure
  const renderMeasureLines = () => {
    return allTimeStamps.map((timestamp, index) => {
      if (timestamp === 'm') {
        const x = index === 0 ? 0 : startX + index * noteWidth;
        return (
          <path
            key={`measure-line-${index}`}
            d={`M ${x} 11 V 131 M ${x} 171 V 211`}
            stroke="var(--text-primary)"
            strokeWidth=".5"
          />
        );
      }
      return null;
    });
  };

  // State for BPM controls visibility
  const [showBpmControls, setShowBpmControls] = React.useState(false);
  const bpmTimerRef = React.useRef(null);

  const resetBpmTimer = () => {
    setShowBpmControls(true);
    if (bpmTimerRef.current) {
      clearTimeout(bpmTimerRef.current);
    }
    bpmTimerRef.current = setTimeout(() => {
      setShowBpmControls(false);
    }, 5000);
  };

  const handleBpmChangeWrapper = (val) => {
    resetBpmTimer();
    onBpmChange(val);
  };

  // Long press for BPM
  const handleBpmLongPress = () => {
    resetBpmTimer();
    setTimeout(() => {
      const input = window.prompt("Enter BPM:", bpm);
      if (input !== null) {
        const val = parseInt(input, 10);
        if (!isNaN(val) && val > 0 && val < 500) {
          onBpmChange(val); // Don't use wrapper to avoid double timer? Actually wrapper is fine.
        }
      }
    }, 10);
  };
  const bpmLongPress = useLongPressLogic();

  const renderBpmControls = () => {
    const x = 30;
    const y = -15; // Moved down from -30
    const term = getTempoTerm(bpm);

    // Alignment offsets
    const textY = y + 2;

    return (
      <g>
        {/* q = [bpm] */}
        <text x={x} y={y + 4} className="bpm-note">q</text>
        <text x={x + 15} y={textY} className="bpm-equals">=</text> {/* Closer (was 20) */}
        <text x={x + 30} y={y - 4} className="bpm-value">{bpm}</text> {/* Closer (was 40) */}

        {/* Italian Term */}
        <text x={x + 75} y={textY} className="tempo-term">{term}</text> {/* Closer (was 95) */}

        {/* Controls (Auto-Hide) */}
        {showBpmControls && (
          <>
            <text x={x + 17} y={y - 4} className="measure-indicator">-</text>
            <text x={x + 70} y={y - 3} className="measure-indicator">+</text>
          </>
        )}

        {/* Split Hitbox on the Number */}
        {/* Number is at x+35 now. Left side ~x+30, Right side ~x+60. Term starts at x+85. */}

        {/* Left Hitbox (Dec) */}
        <rect
          x={x + 0} y={y - 30} width="45" height="45" fill="transparent" style={{ cursor: 'pointer' }}
          onMouseDown={() => bpmLongPress.start(handleBpmLongPress)}
          onMouseUp={(e) => bpmLongPress.end(e, () => handleBpmChangeWrapper(Math.max(10, bpm - 5)))}
          onMouseLeave={() => bpmLongPress.cancel()}
          onTouchStart={() => bpmLongPress.start(handleBpmLongPress)}
          onTouchEnd={(e) => {
            e.preventDefault();
            bpmLongPress.end(e, () => handleBpmChangeWrapper(Math.max(10, bpm - 5)));
          }}
        />

        {/* Right Hitbox (Inc) */}
        <rect
          x={x + 45} y={y - 30} width="45" height="45" fill="transparent" style={{ cursor: 'pointer' }}
          onMouseDown={() => bpmLongPress.start(handleBpmLongPress)}
          onMouseUp={(e) => bpmLongPress.end(e, () => handleBpmChangeWrapper(bpm + 5))}
          onMouseLeave={() => bpmLongPress.cancel()}
          onTouchStart={() => bpmLongPress.start(handleBpmLongPress)}
          onTouchEnd={(e) => {
            e.preventDefault();
            bpmLongPress.end(e, () => handleBpmChangeWrapper(bpm + 5));
          }}
        />
      </g>
    );
  };

  // Global click handler to show all options
  const handleSheetMusicClick = () => {
    resetNumericTimer();
    resetBpmTimer();
  };

  // Randomize Icon Component
  const RandomizeIcon = ({ x, y, onClick }) => {
    const size = 15; // Decreased size (was 20)
    const half = size / 2;
    return (
      <g
        transform={`translate(${x - half}, ${y - half})`} // Centered on x,y
        style={{ cursor: 'pointer' }}
        onClick={(e) => {
          e.stopPropagation(); // Prevent global click
          onClick();
        }}
      >
        <rect x="-10" y="-10" width={size + 20} height={size + 20} fill="transparent" /> {/* Hitbox with padding */}
        {/* Arrow 1: Top-Left to Bottom-Right */}
        <path d={`M 0 0 L ${size} ${size} M ${size - 6} ${size} L ${size} ${size} L ${size} ${size - 6}`} stroke="var(--accent-yellow)" strokeWidth="3" fill="none" />
        {/* Arrow 2: Bottom-Left to Top-Right */}
        <path d={`M 0 ${size} L ${size} 0 M ${size - 6} 0 L ${size} 0 L ${size} 6`} stroke="var(--accent-yellow)" strokeWidth="3" fill="none" />
      </g>
    );
  };

  const renderRandomizeIcons = () => {
    // Only show if controls are active
    if (!showBpmControls) return null;

    // Calculate measure width
    // Measure length in ticks
    const measureLengthTicks = (48 * timeSignature[0]) / timeSignature[1];

    // Calculate total width available for notes
    const notesAreaWidth = endX - startX;

    // Let's collect 'm' x-coordinates
    const boundaries = [];
    let pixelPerSlot = noteWidth;

    allTimeStamps.forEach((ts, i) => {
      if (ts === 'm') {
        boundaries.push(startX + i * pixelPerSlot);
      }
    });
    // Add end point
    boundaries.push(startX + allTimeStamps.length * pixelPerSlot);

    // Only render the RIGHTMOST icon (Last measure)
    if (boundaries.length < 2) return null;

    const i = boundaries.length - 2; // Last interval index
    const mStart = boundaries[i];
    const mEnd = boundaries[i + 1];

    const iconX = mEnd - 50; // Moved right (was -60)

    const renderedIcons = [];

    // Treble Icon (Second topmost line = 21)
    renderedIcons.push(
      <RandomizeIcon
        key={`rand-treble-last`}
        x={iconX}
        y={21}
        onClick={() => onRandomizeMeasure(i, 'treble')}
      />
    );

    // Bass Icon (Second topmost line = 101)
    renderedIcons.push(
      <RandomizeIcon
        key={`rand-bass-last`}
        x={iconX}
        y={101}
        onClick={() => onRandomizeMeasure(i, 'bass')}
      />
    );

    // Percussion Icon (Second topmost line = 181)
    renderedIcons.push(
      <RandomizeIcon
        key={`rand-perc-last`}
        x={iconX}
        y={181}
        onClick={() => onRandomizeMeasure(i, 'percussion')}
      />
    );

    return renderedIcons;
  };

  // Return
  return (
    <div
      style={{ display: 'flex', justifyContent: 'center', width: '100%', height: '100%' }}
      onClick={handleSheetMusicClick} // Global click handler
    >

      <svg
        width={endX + 2}
        viewBox={`0 -60 ${endX + 2} 310`}
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Settings Wheel Icon (Standard SVG gear) - Yellow */}
        <g transform={`translate(${endX - 25}, -50) scale(0.8)`}>
          <path
            fill="var(--accent-yellow)"
            d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z"
          />
        </g>

        {/* Removed yellow lines */}

        {/* Draw BPM Controls */}
        {renderBpmControls()}

        {/* Randomize Icons */}
        {renderRandomizeIcons()}

        {/* Draw musical staff */}
        {staffLines.map((y) => (
          <path
            key={y}
            d={`M 0 ${y} H ${endX}`}
            stroke="var(--text-primary)"
            strokeWidth="0.5"
          />
        ))}
        {/* Clefs */}
        <text x="8" y="40" fontSize="36" fill="var(--text-primary)" fontFamily="Maestro">
          &
        </text>
        <text x="8" y="100" fontSize="36" fill="var(--text-primary)" fontFamily="Maestro">
          ?
        </text>
        {/* Draw percussion staff */}
        <text
          x="18"
          y="200" // Adjust Y position as needed
          fontSize="36"
          fill="var(--text-primary)"
          fontFamily="Maestro">
          /
        </text>
        {/* Display measure number */}
        {renderMeasureTexts()}
        {/* Draw flats or sharps */}
        {renderAccidentals(numAccidentals)}
        {/* Draw notes */}
        {renderMelodyNotes(
          adjustedTrebleMelody,
          numAccidentals,
          startX,
          noteWidth,
          allTimeStamps,
          'treble'
        )}
        {renderMelodyNotes(
          adjustedBassMelody,
          numAccidentals,
          startX,
          noteWidth,
          allTimeStamps,
          'bass'
        )}
        {renderMelodyNotes(
          adjustedPercussionMelody,
          0,
          startX,
          noteWidth,
          allTimeStamps,
          'percussion'
        )}
        {/* Draw measure lines */}
        {renderMeasureLines()}
      </svg>
    </div>
  );
};

export default SheetMusic;
