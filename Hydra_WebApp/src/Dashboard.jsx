import React, { useState } from 'react';
import './App.css';

function StatCard({ label, value }) {
  return (
    <div className="hh-stat-card">
      <div className="hh-stat-value">{value}</div>
      <div className="hh-stat-label">{label}</div>
    </div>
  );
}

function FeatureCard({ title, desc, accent }) {
  return (
    <div className="hh-feature-card">
      <div className={`hh-feature-dot ${accent}`} />
      <h3>{title}</h3>
      <p>{desc}</p>
    </div>
  );
}

function DashboardMockup() {
  const [active, setActive] = useState('Overview');
  const tabs = ['Overview', 'Assessment', 'Protocols', 'History'];

  return (
    <div className="hh-mockup">
      <div className="hh-mockup-header">
        <div>
          <div className="hh-mockup-title">Hydra Heads Dashboard</div>
          <div className="hh-mockup-subtitle">A cleaner overview for your demo</div>
        </div>
        <div className="hh-badges">
          <span className="hh-badge">Live</span>
          <span className="hh-badge">v1.0</span>
        </div>
      </div>

      <div className="hh-tabs">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActive(tab)}
            className={active === tab ? 'hh-tab active' : 'hh-tab'}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="hh-mockup-grid">
        <div className="hh-panel hh-panel-wide">
          <div className="hh-panel-label">Session flow</div>
          {[
            'Camera assessment captured',
            'Pose analysis completed',
            'Protocol draft generated',
            'LinkedIn post draft ready',
          ].map((item) => (
            <div key={item} className="hh-flow-item">
              <div className="hh-flow-check">✓</div>
              <div>{item}</div>
            </div>
          ))}
        </div>

        <div className="hh-panel">
          <div className="hh-panel-label">Quick actions</div>
          {['Start assessment', 'Generate protocol', 'Prepare post'].map((item) => (
            <button key={item} className="hh-action-btn">
              <span>{item}</span>
              <span>→</span>
            </button>
          ))}
          <div className="hh-social-box">
            <div className="hh-panel-label">Social pipeline</div>
            <p>GitHub activity can become LinkedIn-ready content.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const heroBullets = ['Modern UI', 'Fast workflow', 'Better demo', 'Team-ready'];

  return (
    <div className="hh-page">
      <header className="hh-header">
        <div className="hh-brand">
          <div className="hh-logo">HH</div>
          <div>
            <div className="hh-brand-title">Hydra Heads</div>
            <div className="hh-brand-subtitle">Recovery intelligence for a stronger demo</div>
          </div>
        </div>

        <nav className="hh-nav">
          <a href="#home">Home</a>
          <a href="#dashboard">Dashboard</a>
          <a href="#workflow">Workflow</a>
        </nav>
      </header>

      <main id="home" className="hh-main">
        <section className="hh-hero">
          <div className="hh-hero-copy">
            <div className="hh-pill">Hackathon-ready interface refresh</div>
            <h1>
              A brighter, cleaner way to present <span>Hydra Heads</span>.
            </h1>
            <p>
              This landing page and dashboard give your demo a more professional feel for screenshots,
              presentations, and LinkedIn posts.
            </p>

            <div className="hh-chip-row">
              {heroBullets.map((item) => (
                <span key={item} className="hh-chip">
                  {item}
                </span>
              ))}
            </div>

            <div className="hh-cta-row">
              <a href="#dashboard" className="hh-primary-btn">
                View dashboard <span>→</span>
              </a>
              <a href="#workflow" className="hh-secondary-btn">
                See workflow
              </a>
            </div>

            <div className="hh-stats-grid">
              <StatCard label="Assessments" value="128+" />
              <StatCard label="Protocols" value="48" />
              <StatCard label="Linked sources" value="2" />
              <StatCard label="Avg. score" value="92%" />
            </div>
          </div>

          <div id="dashboard" className="hh-hero-dashboard">
            <DashboardMockup />
          </div>
        </section>

        <section className="hh-features">
          <FeatureCard
            accent="accent-cyan"
            title="Camera-based assessment"
            desc="Capture movement, posture, and range-of-motion signals in a guided flow."
          />
          <FeatureCard
            accent="accent-violet"
            title="AI-generated protocol"
            desc="Turn observations into a personalized recommendation in seconds."
          />
          <FeatureCard
            accent="accent-emerald"
            title="Safer workflow"
            desc="Designed for approvals, clarity, and clean handoff between team members."
          />
          <FeatureCard
            accent="accent-amber"
            title="Outcome tracking"
            desc="Track progress, session history, and recovery trends over time."
          />
        </section>

        <section id="workflow" className="hh-workflow">
          <div className="hh-section-head">
            <div>
              <h2>Simple workflow</h2>
              <p>This tells the story your audience should understand in one glance.</p>
            </div>
            <span className="hh-pill small">Commit → Push → Draft → Publish</span>
          </div>

          <div className="hh-steps">
            <div className="hh-step-card">
              <div className="hh-step-num">01</div>
              <h3>Capture</h3>
              <p>Open the assessment flow and record the session.</p>
            </div>
            <div className="hh-step-card">
              <div className="hh-step-num">02</div>
              <h3>Analyze</h3>
              <p>Generate movement insights and a protocol draft.</p>
            </div>
            <div className="hh-step-card">
              <div className="hh-step-num">03</div>
              <h3>Share</h3>
              <p>Review, refine, and publish the post or summary.</p>
            </div>
          </div>

          <div className="hh-two-boxes">
            <div className="hh-info-box cyan">
              <div className="hh-panel-label">GitHub</div>
              <h3>Your code stays technical and clean.</h3>
              <p>Use commit messages to describe the feature, and turn that into a post draft later.</p>
            </div>
            <div className="hh-info-box violet">
              <div className="hh-panel-label">LinkedIn</div>
              <h3>Your story becomes the public-facing version.</h3>
              <p>Edit the generated draft before posting so it sounds like you and fits the audience.</p>
            </div>
          </div>
        </section>

        <section className="hh-footer-cta">
          <h2>Ready for a better demo?</h2>
          <p>
            This version is built to look professional in screenshots, presentations, and LinkedIn posts
            while keeping the product story easy to understand.
          </p>
          <div className="hh-cta-row center">
            <a href="#dashboard" className="hh-primary-btn">Open dashboard <span>→</span></a>
            <a href="#home" className="hh-secondary-btn">Back to top</a>
          </div>
        </section>
      </main>
    </div>
  );
}
