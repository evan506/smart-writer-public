"use client";

import { useEffect, useState } from "react";
import {
  FeaturesSection,
  FinalCta,
  HowItWorks,
  LandingFooter,
  LandingHero,
  LandingNav,
  PainPointSection,
  ProductDemo,
} from "./landing-page-sections";
import { LANDING_THEME as T } from "./landing-page-data";

export default function LandingPage() {
  const [heroVisible, setHeroVisible] = useState(false);
  const [demoVisible, setDemoVisible] = useState(false);

  useEffect(() => {
    const heroTimer = setTimeout(() => setHeroVisible(true), 200);
    const demoTimer = setTimeout(() => setDemoVisible(true), 800);
    return () => {
      clearTimeout(heroTimer);
      clearTimeout(demoTimer);
    };
  }, []);

  return (
    <div className="lp-root">
      <LandingStyles />
      <div className="lp-atmosphere" />
      <LandingNav />
      <LandingHero visible={heroVisible} />
      <ProductDemo visible={demoVisible} />
      <HowItWorks />
      <PainPointSection />
      <FeaturesSection />
      <FinalCta />
      <LandingFooter />
    </div>
  );
}

function LandingStyles() {
  return (
    <style>{`
      :root {
        --lp-bg: ${T.bg.base};
        --lp-surface: ${T.bg.surface};
        --lp-elevated: ${T.bg.elevated};
        --lp-text: ${T.text.primary};
        --lp-text-secondary: ${T.text.secondary};
        --lp-text-muted: ${T.text.muted};
        --lp-accent: ${T.accent};
        --lp-accent-soft: ${T.accentSoft};
        --lp-place: ${T.entity.PLACE};
        --lp-character: ${T.entity.CHARACTER};
      }

      @keyframes lp-blink { 0%, 50% { opacity: 1 } 51%, 100% { opacity: 0 } }
      @keyframes lp-pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.4 } }

      .lp-root {
        min-height: 100vh;
        overflow-x: hidden;
        background: var(--lp-bg);
        color: var(--lp-text);
        font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif;
      }
      .lp-atmosphere {
        position: fixed;
        inset: 0;
        z-index: 0;
        pointer-events: none;
        background:
          linear-gradient(180deg, rgba(255,250,241,0.72) 0%, rgba(248,244,236,0) 42%),
          radial-gradient(ellipse 60% 40% at 80% 80%, rgba(79,140,92,0.04) 0%, transparent 50%);
      }
      .lp-nav, .lp-hero, .lp-demo, .lp-narrow-section, .lp-card-section, .lp-feature-section, .lp-final, .lp-footer {
        position: relative;
        z-index: 5;
      }
      .lp-nav {
        z-index: 10;
        display: flex;
        align-items: center;
        justify-content: space-between;
        max-width: 1200px;
        margin: 0 auto;
        padding: 20px 40px;
      }
      .lp-brand {
        display: flex;
        align-items: center;
        gap: 10px;
        color: var(--lp-text);
        font-size: 18px;
        font-weight: 800;
        letter-spacing: 0;
      }
      .lp-brand-mark { color: var(--lp-accent); font-size: 20px; }
      .lp-button {
        display: inline-block;
        border-radius: 10px;
        background: var(--lp-accent);
        color: #fffaf1;
        font-weight: 700;
        text-decoration: none;
        transition: transform 0.2s, box-shadow 0.2s, opacity 0.15s;
      }
      .lp-button:hover { opacity: 0.88; transform: translateY(-2px); }
      .lp-button-sm { padding: 10px 24px; border-radius: 8px; font-size: 14px; }
      .lp-button-lg { padding: 14px 36px; font-size: 16px; box-shadow: 0 4px 24px rgba(79,140,92,0.16); }
      .lp-button-lg:hover { box-shadow: 0 8px 32px rgba(79,140,92,0.2); }

      .lp-hero {
        max-width: 1200px;
        margin: 0 auto;
        padding: 60px 40px 0;
        text-align: center;
      }
      .lp-kicker, .lp-section-heading span {
        display: inline-block;
        color: var(--lp-accent);
        font-family: 'JetBrains Mono', monospace;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .lp-kicker {
        padding: 6px 16px;
        border: 1px solid rgba(79,140,92,0.18);
        border-radius: 100px;
        background: var(--lp-accent-soft);
        font-size: 12px;
      }
      .lp-reveal, .lp-title, .lp-lead, .lp-hero-cta, .lp-demo, .lp-step {
        opacity: 0;
        transform: translateY(20px);
        transition: all 0.7s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .lp-reveal.is-visible, .lp-title.is-visible, .lp-lead.is-visible, .lp-hero-cta.is-visible, .lp-demo.is-visible, .lp-step.is-visible {
        opacity: 1;
        transform: translateY(0);
      }
      .lp-title {
        margin: 20px 0;
        font-size: 56px;
        font-weight: 900;
        line-height: 1.2;
        letter-spacing: 0;
        transition-delay: 0.1s;
      }
      .lp-title span { color: var(--lp-accent); }
      .lp-lead {
        max-width: 520px;
        margin: 0 auto 40px;
        color: var(--lp-text-secondary);
        font-size: 17px;
        line-height: 1.7;
        transition-delay: 0.2s;
      }
      .lp-hero-cta { margin-bottom: 60px; transition-delay: 0.3s; }
      .lp-muted-note { margin-top: 12px; color: var(--lp-text-muted); font-size: 13px; }

      .lp-demo { max-width: 1100px; margin: 0 auto; padding: 0 40px 80px; transform: translateY(30px); }
      .lp-window {
        overflow: hidden;
        border: 1px solid #e8e0ce;
        border-radius: 16px;
        background: var(--lp-surface);
        box-shadow: 0 24px 80px rgba(79, 66, 45, 0.12);
      }
      .lp-titlebar { display: flex; align-items: center; gap: 8px; padding: 12px 20px; border-bottom: 1px solid #e8e0ce; }
      .lp-window-dots { display: flex; gap: 6px; }
      .lp-window-dots span { width: 10px; height: 10px; border-radius: 50%; }
      .lp-window-title, .lp-codex small, .lp-entity small, .lp-relations div, .lp-indicator strong {
        font-family: 'JetBrains Mono', monospace;
      }
      .lp-window-title { margin-left: 8px; color: var(--lp-text-muted); font-size: 12px; }
      .lp-workspace { display: flex; min-height: 380px; }
      .lp-editor { flex: 1; padding: 28px 32px; border-right: 1px solid #e8e0ce; }
      .lp-novel-text { white-space: pre-wrap; color: var(--lp-text); font-size: 15px; line-height: 2; }
      .lp-caret { display: inline-block; width: 2px; height: 18px; margin-left: 2px; background: var(--lp-accent); animation: lp-blink 1s infinite; vertical-align: text-bottom; }
      .lp-codex { width: 300px; padding: 16px; background: rgba(243,236,223,0.68); }
      .lp-codex-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid #e8e0ce; }
      .lp-codex-head div { display: flex; align-items: center; gap: 8px; }
      .lp-codex-head span { color: var(--lp-accent); font-size: 13px; }
      .lp-codex-head strong { color: var(--lp-text-secondary); font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; }
      .lp-codex-head small { color: var(--lp-text-muted); font-size: 11px; }
      .lp-entity-list { display: flex; flex-direction: column; gap: 6px; }
      .lp-entity { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid transparent; border-radius: 8px; }
      .lp-entity.is-active { border-color: color-mix(in srgb, var(--entity-color), transparent 80%); background: color-mix(in srgb, var(--entity-color), transparent 90%); }
      .lp-entity > span { width: 6px; height: 6px; flex-shrink: 0; border-radius: 50%; background: var(--entity-color); }
      .lp-entity > div { min-width: 0; flex: 1; }
      .lp-entity strong { display: block; color: var(--lp-text); font-size: 13px; font-weight: 600; }
      .lp-entity.is-active strong { color: var(--entity-color); }
      .lp-entity small { display: block; overflow: hidden; margin-top: 2px; color: var(--lp-text-muted); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
      .lp-relations { margin-top: 16px; padding-top: 12px; border-top: 1px solid #e8e0ce; }
      .lp-relations h3 { margin: 0 0 8px; color: var(--lp-text-muted); font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
      .lp-relations div { display: flex; align-items: center; gap: 6px; margin-bottom: 5px; color: var(--lp-text-secondary); font-size: 11px; }
      .lp-relations span { color: var(--lp-character); }
      .lp-relations em { color: var(--lp-text-muted); font-style: normal; }
      .lp-relations strong { font-size: 10px; }
      .lp-indicator { display: flex; justify-content: center; margin-top: 24px; }
      .lp-indicator-pill { display: inline-flex; align-items: center; gap: 8px; padding: 8px 20px; border: 1px solid rgba(79,140,92,0.18); border-radius: 100px; background: rgba(79,140,92,0.08); }
      .lp-indicator-pill span { width: 6px; height: 6px; border-radius: 50%; background: var(--lp-place); animation: lp-pulse 2s infinite; }
      .lp-indicator-pill strong { color: var(--lp-place); font-size: 12px; font-weight: 600; }

      .lp-narrow-section { max-width: 640px; margin: 0 auto; padding: 40px 40px 80px; }
      .lp-section-heading { margin-bottom: 40px; text-align: center; }
      .lp-section-heading h2 { margin: 12px 0 0; color: var(--lp-text); font-size: 28px; font-weight: 900; letter-spacing: 0; }
      .lp-steps { display: flex; flex-direction: column; gap: 36px; }
      .lp-step { display: flex; align-items: flex-start; gap: 20px; }
      .lp-step-number { display: flex; width: 40px; height: 40px; flex-shrink: 0; align-items: center; justify-content: center; border: 1px solid rgba(79,140,92,0.18); border-radius: 10px; background: var(--lp-accent-soft); color: var(--lp-accent); font-family: 'JetBrains Mono', monospace; font-size: 15px; font-weight: 700; }
      .lp-step h3 { margin: 0 0 6px; color: var(--lp-text); font-size: 17px; font-weight: 700; letter-spacing: 0; }
      .lp-step p { margin: 0; color: var(--lp-text-secondary); font-size: 14px; line-height: 1.6; }

      .lp-card-section { max-width: 800px; margin: 0 auto; padding: 0 40px 80px; }
      .lp-pain-card { padding: 40px; border: 1px solid #e8e0ce; border-radius: 16px; background: var(--lp-surface); text-align: center; }
      .lp-pain-icon { margin-bottom: 16px; font-size: 32px; }
      .lp-pain-card h3 { margin: 0 0 16px; color: var(--lp-text); font-size: 20px; font-weight: 800; letter-spacing: 0; }
      .lp-pain-list { display: flex; max-width: 480px; margin: 0 auto; flex-direction: column; gap: 12px; text-align: left; }
      .lp-pain-list div { padding: 12px 16px; border: 1px solid rgba(163,90,69,0.12); border-radius: 8px; background: rgba(163,90,69,0.05); color: var(--lp-text-secondary); font-size: 14px; line-height: 1.6; }
      .lp-pain-card > strong { display: block; margin-top: 24px; color: var(--lp-accent); font-size: 15px; }

      .lp-feature-section { max-width: 900px; margin: 0 auto; padding: 0 40px 80px; }
      .lp-feature-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
      .lp-feature { padding: 24px 20px; border: 1px solid #e8e0ce; border-radius: 12px; background: var(--lp-elevated); backdrop-filter: blur(12px); transition: transform 0.2s, border-color 0.2s; }
      .lp-feature:hover { border-color: color-mix(in srgb, var(--feature-color), transparent 70%); transform: translateY(-2px); }
      .lp-feature span { display: block; margin-bottom: 12px; font-size: 24px; }
      .lp-feature h3 { margin: 0 0 8px; color: var(--lp-text); font-size: 15px; font-weight: 700; letter-spacing: 0; }
      .lp-feature p { margin: 0; color: var(--lp-text-secondary); font-size: 13px; line-height: 1.6; }

      .lp-final { max-width: 700px; margin: 0 auto; padding: 40px 40px 100px; text-align: center; }
      .lp-final > div { padding: 56px 40px; border: 1px solid rgba(79,140,92,0.16); border-radius: 20px; background: linear-gradient(135deg, var(--lp-accent-soft), rgba(255,250,241,0.7)); }
      .lp-final h2 { margin: 0 0 16px; color: var(--lp-text); font-size: 28px; font-weight: 900; letter-spacing: 0; }
      .lp-final p { margin: 0 0 32px; color: var(--lp-text-secondary); font-size: 15px; line-height: 1.7; }
      .lp-footer { padding: 24px 40px; border-top: 1px solid #e8e0ce; color: var(--lp-text-muted); text-align: center; font-size: 12px; }

      @media (max-width: 820px) {
        .lp-nav, .lp-hero, .lp-demo, .lp-narrow-section, .lp-card-section, .lp-feature-section, .lp-final { padding-left: 20px; padding-right: 20px; }
        .lp-title { font-size: 36px; }
        .lp-workspace, .lp-feature-grid { grid-template-columns: 1fr; }
        .lp-workspace { display: block; }
        .lp-editor { border-right: 0; border-bottom: 1px solid #e8e0ce; }
        .lp-codex { width: auto; }
        .lp-lead br { display: none; }
      }
      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after {
          animation-duration: 0.01ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: 0.01ms !important;
        }
      }
    `}</style>
  );
}
