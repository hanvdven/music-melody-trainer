import React, { useRef, useEffect } from 'react';

const PianoContainer = ({ trebleInstrument, pianoProps }) => {
    const pianoRef = useRef(null);

    // Optioneel: resize listener voor canvas/SVG
    useEffect(() => {
        const handleResize = () => {
            if (pianoRef.current) {
                pianoRef.current.width = pianoRef.current.offsetWidth;
                pianoRef.current.height = pianoRef.current.offsetHeight;
            }
        };
        window.addEventListener('resize', handleResize);
        handleResize();
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    return (
        <div
            ref={pianoRef}
            className="piano-container"
        >
            {trebleInstrument && <pianoProps.Component {...pianoProps} />}
        </div>
    );
};

export default PianoContainer;
