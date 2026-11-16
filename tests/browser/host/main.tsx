import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { exercises } from '@kimorel/data';
import { ExerciseViewer } from '@kimorel/react';

function Consumer() {
  const [id, setId] = useState(exercises[0]!.id);
  const [base, setBase] = useState('http://127.0.0.1:4176/library');
  const [clip, setClip] = useState('rep');
  const [mounted, setMounted] = useState(true);
  const original = exercises.find((exercise) => exercise.id === id)!;
  const exercise = {
    ...original,
    animation: { ...original.animation!, clip },
  };
  return (
    <main>
      <h1>Consumer integration fixture</h1>
      <label>
        Host exercise
        <select value={id} onChange={(event) => setId(event.target.value)}>
          {exercises.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Host asset base
        <input value={base} onChange={(event) => setBase(event.target.value)} />
      </label>
      <label>
        Host clip
        <input value={clip} onChange={(event) => setClip(event.target.value)} />
      </label>
      <label>
        Mount viewer
        <input
          type="checkbox"
          checked={mounted}
          onChange={(event) => setMounted(event.target.checked)}
        />
      </label>
      {mounted && (
        <ExerciseViewer
          exercise={exercise}
          assetBaseUrl={base}
          controls
          review
        />
      )}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<Consumer />);
