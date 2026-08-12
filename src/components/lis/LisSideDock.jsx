"use client";

/**
 * The dark dock on the left of the shell: navigation rail plus the persistent
 * worklist column. Kept as one element so both share a single rounded surface,
 * as in the reference layout.
 *
 * The worklist column is hidden below 1280px (see `globals.css`) to give the
 * wide LIS tables the room they need on smaller screens; the rail always stays.
 */

import React from 'react';
import LisRail from './LisRail';
import LisWorklist from './LisWorklist';

export default function LisSideDock({ activePanel, setActivePanel, showWorklist = true }) {
  return (
    <div className={`lis-dock${showWorklist ? '' : ' is-rail-only'}`}>
      <LisRail activePanel={activePanel} setActivePanel={setActivePanel} />
      {showWorklist && (
        <LisWorklist onOpenWorklist={() => setActivePanel('specimen_tracking')} />
      )}
    </div>
  );
}
