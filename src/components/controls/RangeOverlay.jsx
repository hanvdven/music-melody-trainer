import React, { useEffect } from 'react';
import { X } from 'lucide-react';

/**
 * RangeOverlay — context-overlay scaffold for the visual settings re-haul
 * (GSM portrait first). This is intentionally an EMPTY placeholder: it only
 * establishes the open/close shell (backdrop + click-outside + Escape) so the
 * new "bladmuziek" (note-row) and "input" (keyboard) range UIs can be dropped
 * into the body later without re-wiring navigation.
 *
 * Temporary: opened from an always-visible "RANGE" button in the SubHeader.
 * Both that button and this generic shell will be replaced by tap-on-element
 * context overlays once the range interaction is designed. See the re-haul
 * section in docs/architecture.md.
 */
const RangeOverlay = ({ open, onClose }) => {
    // Close on Escape, but only while open so we don't swallow Escape for the
    // rest of the app when the overlay is dismissed.
    useEffect(() => {
        if (!open) return;
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!open) return null;

    return (
        // Backdrop: a click here (outside the panel) closes the overlay.
        <div
            onClick={onClose}
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 1000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(0, 0, 0, 0.55)',
            }}
        >
            {/* Panel: stopPropagation so clicks inside keep the overlay open. */}
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    position: 'relative',
                    width: 'min(92vw, 460px)',
                    minHeight: '240px',
                    background: 'var(--bg-secondary, #1e1e28)',
                    border: '1px solid var(--border-color, #333)',
                    borderRadius: '14px',
                    boxShadow: '0 12px 40px rgba(0, 0, 0, 0.5)',
                    padding: '18px',
                    boxSizing: 'border-box',
                    color: 'var(--text-primary, #eee)',
                }}
            >
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '14px',
                }}>
                    <span style={{
                        fontFamily: 'sans-serif',
                        fontSize: '16px',
                        fontWeight: 'bold',
                        letterSpacing: '0.3px',
                    }}>Range</span>
                    <button
                        onClick={onClose}
                        aria-label="Close"
                        style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--text-secondary, #aaa)',
                            cursor: 'pointer',
                            display: 'flex',
                            padding: 4,
                        }}
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Empty scaffold body. The note-row (sheet) and keyboard (input)
                    range variants will be built here as the first vertical slice
                    of the re-haul. */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '160px',
                    borderRadius: '10px',
                    border: '1px dashed var(--border-color, #444)',
                    color: 'var(--text-dim, #777)',
                    fontFamily: 'sans-serif',
                    fontSize: '13px',
                }}>
                    Range overlay — coming soon
                </div>
            </div>
        </div>
    );
};

export default RangeOverlay;
