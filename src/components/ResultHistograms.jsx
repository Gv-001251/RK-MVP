"use client";

import React, { useEffect, useState } from 'react';

/**
 * Cell-distribution histograms sent by the analyzer alongside the numbers.
 *
 * A reviewer reading a differential wants the curve as well as the counts: a
 * bimodal WBC distribution or a platelet clump shows in the shape and is
 * invisible in the values. Renders nothing at all when an order has no images,
 * so orders from instruments that send none look exactly as they did before.
 *
 * The instrument also reports the discriminator positions it used to split each
 * population — the dashed verticals on the plot — and those are listed under the
 * image so the numbers behind the curve are visible too.
 */

/** 280x120 native is small on a modern display; show it at double size. */
const DISPLAY_SCALE = 2;

function Histogram({ image, accession, onOpen }) {
  const width = image.width ? image.width * DISPLAY_SCALE : 560;
  const alt = `${image.label || image.name} cell-distribution histogram`
    + (accession ? ` for accession ${accession}` : '');

  return (
    <figure style={{ margin: 0 }}>
      <figcaption
        style={{
          display: 'flex', alignItems: 'baseline', gap: '8px',
          fontSize: '12px', fontWeight: 800, color: 'var(--text-primary)',
          textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px',
        }}
      >
        {image.label || image.name}
        <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0, color: 'var(--text-muted)' }}>
          {image.width && image.height ? `${image.width}×${image.height}` : ''}
          {image.analyzerId ? ` · ${image.analyzerId}` : ''}
        </span>
      </figcaption>

      <button
        type="button"
        onClick={() => onOpen(image)}
        title="Click to enlarge"
        style={{
          padding: 0, border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)',
          background: '#fff', cursor: 'zoom-in', display: 'block', width: '100%', overflow: 'hidden',
        }}
      >
        {/*
          A plain <img> rather than next/image on purpose. These are patient
          images behind an authenticated route; the Next image optimizer fetches
          server-side without the session cookie, so it would get a 401.
        */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image.url}
          alt={alt}
          width={image.width || undefined}
          height={image.height || undefined}
          style={{ display: 'block', width: '100%', maxWidth: `${width}px`, height: 'auto' }}
        />
      </button>

      {image.markers?.length > 0 && (
        <div style={{ marginTop: '6px', display: 'flex', flexWrap: 'wrap', gap: '4px 10px' }}>
          {image.markers.map((m, i) => (
            <span key={i} style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {m.label}
              <strong style={{ color: 'var(--text-secondary)', marginLeft: '3px' }}>{m.value}</strong>
            </span>
          ))}
        </div>
      )}
    </figure>
  );
}

export default function ResultHistograms({ images, accession }) {
  const [zoomed, setZoomed] = useState(null);

  useEffect(() => {
    if (!zoomed) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setZoomed(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoomed]);

  if (!images?.length) return null;

  return (
    <section style={{ marginTop: '18px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '10px' }}>
        <h4 style={{ margin: 0, fontFamily: 'var(--font-title)', fontWeight: 800, fontSize: '14px', color: 'var(--text-primary)' }}>
          Analyzer Graphs
        </h4>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          {images.length} histogram{images.length > 1 ? 's' : ''} received with this result
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
        {images.map((image) => (
          <Histogram key={image.id} image={image} accession={accession} onOpen={setZoomed} />
        ))}
      </div>

      {zoomed && (
        <div
          onClick={() => setZoomed(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`${zoomed.label || zoomed.name} histogram, enlarged`}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', zIndex: 1100,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 'var(--radius-lg, 14px)', padding: '18px', maxWidth: 'min(900px, 100%)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
              <strong style={{ fontSize: '14px' }}>{zoomed.name}</strong>
              <button className="btn btn-secondary btn-sm" onClick={() => setZoomed(null)}>Close</button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={zoomed.url}
              alt={`${zoomed.label || zoomed.name} cell-distribution histogram, enlarged`}
              style={{ display: 'block', width: '100%', height: 'auto' }}
            />
            {zoomed.markers?.length > 0 && (
              <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                Discriminators: {zoomed.markers.map((m) => `${m.label} ${m.value}`).join(' · ')}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
