import { useEffect, useRef, useState } from 'react';
import type { Exercise } from '@kimorel/core';
import { ExerciseViewer } from '@kimorel/react';
import { pilotAssets, pilotExercise } from './pilot';

/** Key by exercise ID at the caller: opt-in and failures never leak to another exercise. */
export function ExercisePreview({
  exercise,
  review,
}: {
  exercise: Exercise;
  review: boolean;
}) {
  const [enabled, setEnabled] = useState(false);
  const [failed, setFailed] = useState(false);
  const generation = useRef(0);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const draft = pilotExercise(exercise);
  const usingDraft = enabled && !failed && !!draft;
  const attempt = generation.current;
  return (
    <>
      <label className="review-switch">
        <input
          type="checkbox"
          checked={enabled}
          disabled={!draft}
          onChange={(event) => {
            generation.current++;
            setFailed(false);
            setEnabled(event.target.checked);
          }}
        />
        Experimental character v2 (three-exercise pilot)
      </label>
      <p role="status" aria-live="polite">
        {usingDraft
          ? 'Experimental v2 draft — anatomy, muscle activation and physical-device acceptance are pending.'
          : failed
            ? 'Experimental v2 could not load. Showing original v1 instead.'
            : draft
              ? 'Showing original v1. Character v2 is opt-in.'
              : 'Showing original v1. This exercise has no v2 pilot yet.'}
      </p>
      {usingDraft && (
        <details>
          <summary>Experimental asset identity</summary>
          <p>Clip: rep · 4 seconds · needs review · CC0-1.0</p>
          <p>
            SHA256: <code>{pilotAssets[exercise.id]!.sha256}</code>
          </p>
          <p>V2 muscle overlays are not enabled. No approval is inferred.</p>
        </details>
      )}
      <ExerciseViewer
        key={usingDraft ? `v2:${attempt}` : 'v1'}
        exercise={usingDraft ? draft : exercise}
        assetBaseUrl="./assets"
        autoPlay={!review}
        review={review}
        muscleHighlights={!usingDraft}
        loop
        controls
        onError={() => {
          if (usingDraft && active.current && attempt === generation.current) {
            generation.current++;
            setFailed(true);
          }
        }}
      />
    </>
  );
}
