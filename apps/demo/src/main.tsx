import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { exercises, assetReviewRecords } from '@kimorel/data';
import { ExercisePreview } from './ExercisePreview';
import './style.css';
import { Catalog } from './Catalog';
import { ExerciseDetails } from './ExerciseDetails';
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
          <p className="eyebrow">
            OPEN SOURCE · {exercises.length} MOVEMENT PREVIEWS
          </p>
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
              {exercises.length} original animated exercises, pending human
              visual approval.
            </p>
            <Catalog
              exercises={exercises}
              selectedId={selected.id}
              onSelect={setSelected}
            />
            <div className="note">
              <strong>
                {exercises.length} movements, one reusable character.
              </strong>
              <p>
                Original standing and floor movements are available for
                technical review. No visual approval or clinical validation is
                claimed.
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
                aria-label="Original v1 asset review identity"
              >
                <h3>Original v1 asset identity</h3>
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
            <ExercisePreview
              key={selected.id}
              exercise={selected}
              review={review}
            />
            <ExerciseDetails exercise={selected} />
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
