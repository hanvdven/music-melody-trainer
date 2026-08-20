import React from 'react';
import { CreatureSprite } from './CreatureSprite';

// #1093 (Han 2026-08-20, open-world worker NPCs): PURE render of one worker (blacksmith slow/fast,
// lumberjack, town crier, lady potions, steampunker) via the canonical `CreatureSprite` (§6d) — mirrors
// `WorldCreature`'s own stateless shape exactly (RpgLevelPanel.jsx) so it can safely be rendered TWICE per
// NPC (the main sprite + its water-reflection mirror, `EntityReflection`) without duplicating any state or
// side effect. The idle/hit ANIMATION STATE MACHINE and beat-synced audio triggering live in
// `useWorkerHitState` (hooks/useWorkerHitState.js), called ONCE per NPC by the parent — this component
// only ever renders whatever `{ anim, frame }` that hook already resolved.
export default function WorkerNpc({ variant, anim, frame, facing = 1, zoom }) {
    if (!variant || !anim) return null;
    const cropW = variant.crop.w * zoom, cropH = variant.crop.h * zoom;
    const nativeFlip = variant.facing === 'right' ? 1 : -1;
    const scaleX = facing * nativeFlip;
    return (
        <div style={{ width: cropW, height: cropH, transform: `scale(${scaleX}, 1)` }}>
            <CreatureSprite variant={variant} anim={anim} frame={frame} scale={zoom} framed={false} />
        </div>
    );
}
