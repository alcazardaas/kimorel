import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { exercises, assetReviewRecords } from '@kimorel/data';
import { ExerciseViewer } from '@kimorel/react';
import './style.css';
function App() {
  const [selected, setSelected] = useState(exercises[0]!);
  const [review, setReview] = useState(false);
  const identity = assetReviewRecords.find(
    (record) => record.assetId === selected.animation?.assetId,
  );
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header>
        <a className="brand" href="./" aria-label="Kimorel home">
          <span className="mark" aria-hidden="true">
            k.
          </span>{' '}
          kimorel
        </a>
        <nav aria-label="Main">
          <a href="#catalog">Explore the catalog</a>
          <a href="./docs/">Documentation ↗</a>
        </nav>
      </header>
      <main id="main">
        <section className="intro">
          <p className="eyebrow">OPEN SOURCE · THREE MOVEMENT PREVIEWS</p>
          <h1>
            Human movement,
            <br />
            <em>openly animated.</em>
          </h1>
          <p className="lead">
            A shared foundation for visualizing exercise in three dimensions.
            Built for developers. Open to everyone.
          </p>
          <div className="pills">
            <span>TypeScript + React</span>
            <span>Self-hostable</span>
            <span>No accounts. No API fees.</span>
          </div>
        </section>
        <section className="workspace" aria-labelledby="catalog">
          <aside>
            <p className="eyebrow">THE MOVEMENT LIBRARY</p>
            <h2 id="catalog">Start exploring</h2>
            <p className="muted">
              Three original animated exercises, pending human visual approval.
            </p>
            <ul className="catalog">
              {exercises.map((exercise, index) => (
                <li key={exercise.id}>
                  <button
                    aria-pressed={selected.id === exercise.id}
                    onClick={() => setSelected(exercise)}
                  >
                    <span className="number">0{index + 1}</span>
                    <span>
                      <strong>{exercise.name}</strong>
                      <small>
                        {exercise.movementPattern} ·{' '}
                        {exercise.equipment.join(', ')}
                      </small>
                    </span>
                    <span aria-hidden="true">↗</span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="note">
              <strong>Three movements, one reusable character.</strong>
              <p>
                Squat, push-up and dumbbell curl are available for technical
                review. No visual approval or clinical validation is claimed.
              </p>
            </div>
          </aside>
          <article className="detail">
            <div className="detail-heading">
              <div>
                <p className="eyebrow">{selected.bodyRegions.join(' · ')}</p>
                <h2>{selected.name}</h2>
              </div>
              <span className="badge">
                {selected.animation
                  ? 'Original animation · review preview'
                  : 'Example metadata'}
              </span>
            </div>
            <label className="review-switch">
              <input
                type="checkbox"
                checked={review}
                onChange={(event) => setReview(event.target.checked)}
              />
              Visual review mode
            </label>
            {review && (
              <section
                className="review-notes"
                aria-label="Asset review identity"
              >
                <h3>Review this exact asset</h3>
                <p>
                  {identity?.file} · {identity?.bytes} bytes ·{' '}
                  {identity?.status}
                </p>
                <p>
                  SHA256: <code>{identity?.sha256}</code>
                </p>
                <p>
                  Review at 0.25×/0.5× from each camera. Remember and recall a
                  pose to compare views. Approval is never automatic.
                </p>
                <ul>
                  <li>Anatomical plausibility and recognizable movement</li>
                  <li>Hand/foot contact and equipment grip</li>
                  <li>
                    Shoulder, elbow, pelvis and knee deformation; intersections
                  </li>
                  <li>Camera framing and loop seam</li>
                  <li>License provenance and exact hash</li>
                </ul>
                <p>
                  Record reviewer, date, SHA256 and notes in ASSET_LICENSES.json
                  only after human review. Follow docs/asset-licensing.md.
                  Clinical review is separate.
                </p>
              </section>
            )}
            <ExerciseViewer
              exercise={selected}
              assetBaseUrl="./assets"
              autoPlay={!review}
              review={review}
              loop
              controls
            />
            <div className="description">
              <h3>About this movement</h3>
              <p>{selected.description}</p>
              <p>
                <strong>Primary muscles:</strong>{' '}
                {selected.muscles.primary.join(', ')}
              </p>
              <p>
                <strong>Secondary muscles:</strong>{' '}
                {selected.muscles.secondary.join(', ')}
              </p>
              <p>
                <strong>Equipment:</strong> {selected.equipment.join(', ')}
              </p>
              <h3>Movement instructions</h3>
              <ol>
                {selected.instructions.map((instruction) => (
                  <li key={instruction}>{instruction}</li>
                ))}
              </ol>
              <p className="muted">
                Educational example only. Not medical advice or a treatment
                prescription.
              </p>
            </div>
          </article>
        </section>
        <section className="principles">
          <div>
            <span>01 / OPEN</span>
            <h3>Yours to build with.</h3>
            <p>
              MIT software and original CC0 metadata. No mandatory external
              services.
            </p>
          </div>
          <div>
            <span>02 / PORTABLE</span>
            <h3>One library. Any platform.</h3>
            <p>A framework-independent core with an embeddable React viewer.</p>
          </div>
          <div>
            <span>03 / TRACEABLE</span>
            <h3>Quality before quantity.</h3>
            <p>
              Licensing, provenance and human review before any asset is
              released.
            </p>
          </div>
        </section>
      </main>
      <footer>
        <strong>kimorel</strong>
        <span>Human movement belongs to everyone.</span>
        <a href="./docs/">Read the documentation ↗</a>
      </footer>
    </>
  );
}
const root = document.getElementById('root');
if (!root) throw new Error('Application root is missing');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
