// components/common/GenericTypeSelector.jsx
import React from 'react';

const GenericTypeSelector = ({
    title,
    options, // Array of strings or objects { label, value }
    onSelect,
    onClose,
    selectedValue
}) => {
    return (
        <div
            style={{
                position: 'fixed',
                top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: 'rgba(0,0,0,0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000
            }}
            onClick={onClose}
        >
            <div
                style={{
                    backgroundColor: '#222',
                    padding: '20px',
                    borderRadius: '10px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    minWidth: '250px',
                    maxHeight: '80vh',
                    overflowY: 'auto'
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {title && (
                    <div style={{ color: 'white', textAlign: 'center', marginBottom: '5px', fontWeight: 'bold', textTransform: 'uppercase' }}>
                        {title}
                    </div>
                )}

                {options.map((opt, idx) => {
                    const label = typeof opt === 'object' ? opt.label : opt;
                    const value = typeof opt === 'object' ? opt.value : opt;
                    const isActive = selectedValue === value;

                    return (
                        <button
                            key={idx}
                            onClick={() => onSelect(value)}
                            className="scale-selector-button"
                            style={{
                                width: '100%',
                                textAlign: 'center',
                                padding: '12px 40px',
                                fontSize: '14px',
                                height: 'auto',
                                backgroundColor: isActive ? 'var(--accent-yellow)' : '#333',
                                color: isActive ? 'black' : 'white',
                                border: '1px solid #444',
                                cursor: 'pointer',
                                position: 'relative',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                        >
                            {opt.icon && (
                                <div style={{ position: 'absolute', left: '16px', display: 'flex', alignItems: 'center' }}>
                                    {opt.icon}
                                </div>
                            )}
                            {label}
                        </button>
                    );
                })}

                <button
                    onClick={onClose}
                    style={{
                        marginTop: '10px',
                        background: 'none',
                        border: '1px solid #444',
                        color: '#888',
                        padding: '8px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        width: '100%'
                    }}
                >
                    Cancel
                </button>
            </div>
        </div>
    );
};

export default GenericTypeSelector;
