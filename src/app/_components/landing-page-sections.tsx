"use client";

import type React from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ENTITIES,
  FEATURES,
  LANDING_THEME as T,
  NOVEL_TEXT,
  PAIN_POINTS,
  RELATION_LINES,
  STEPS,
  TEXT_ENTITIES,
} from "./landing-page-data";
import { UnderlinedText } from "./landing-underlined-text";

export function LandingNav() {
  return (
    <nav className="lp-nav">
      <div className="lp-brand">
        <span className="lp-brand-mark">✦</span>
        <span>Smart Writer</span>
      </div>
      <Link className="lp-button lp-button-sm" href="/login">
        시작하기
      </Link>
    </nav>
  );
}

export function LandingHero({ visible }: { visible: boolean }) {
  return (
    <section className="lp-hero">
      <div className={visible ? "lp-reveal is-visible" : "lp-reveal"}>
        <span className="lp-kicker">웹소설 작가를 위한 작품 기억 도구</span>
      </div>
      <h1 className={visible ? "lp-title is-visible" : "lp-title"}>
        글은 작가가 씁니다.
        <br />
        <span>Smart Writer는</span> 원고 속 설정을 기억합니다.
      </h1>
      <p className={visible ? "lp-lead is-visible" : "lp-lead"}>
        챕터를 저장하면 Smart Writer가 인물, 장소, 아이템, 관계 후보를
        <br />
        원문 근거와 함께 보여주고, 작가가 승인한 정보만 Codex에 기억합니다.
        <br />
        긴 연재에서도 설정을 잃어버리지 않도록 돕습니다.
      </p>
      <div className={visible ? "lp-hero-cta is-visible" : "lp-hero-cta"}>
        <Link className="lp-button lp-button-lg" href="/login">
          무료로 시작하기 →
        </Link>
        <div className="lp-muted-note">AI가 확정하지 않고, 작가가 검토합니다</div>
      </div>
    </section>
  );
}

export function ProductDemo({ visible }: { visible: boolean }) {
  return (
    <section className={visible ? "lp-demo is-visible" : "lp-demo"}>
      <div className="lp-window">
        <div className="lp-titlebar">
          <div className="lp-window-dots">
            <span style={{ background: "#ef4444" }} />
            <span style={{ background: "#f59e0b" }} />
            <span style={{ background: "#22c55e" }} />
          </div>
          <span className="lp-window-title">나의 판타지 소설 — Ch.15</span>
        </div>
        <div className="lp-workspace">
          <div className="lp-editor">
            <div className="lp-novel-text">
              <UnderlinedText text={NOVEL_TEXT} entities={TEXT_ENTITIES} />
            </div>
            <span className="lp-caret" />
          </div>
          <CodexPreview />
        </div>
      </div>
      <div className="lp-indicator">
        <div className="lp-indicator-pill">
          <span />
          <strong>원문 근거가 연결된 후보 5개 · 관계 후보 4개</strong>
        </div>
      </div>
    </section>
  );
}

function CodexPreview() {
  return (
    <aside className="lp-codex">
      <div className="lp-codex-head">
        <div>
          <span>✦</span>
          <strong>작품 기억</strong>
        </div>
        <small>8개 설정</small>
      </div>
      <div className="lp-entity-list">
        {ENTITIES.slice(0, 6).map((entity, index) => {
          const color =
            T.entity[entity.type as keyof typeof T.entity] ?? T.entity.CHARACTER;
          return (
            <div
              className={index === 0 ? "lp-entity is-active" : "lp-entity"}
              key={entity.name}
              style={
                {
                  "--entity-color": color,
                } as React.CSSProperties
              }
            >
              <span />
              <div>
                <strong>{entity.name}</strong>
                <small>{entity.desc}</small>
              </div>
            </div>
          );
        })}
      </div>
      <div className="lp-relations">
        <h3>관계</h3>
        {RELATION_LINES.map((relation) => (
          <div key={`${relation.from}-${relation.to}-${relation.label}`}>
            <span>{relation.from}</span>
            <em>→</em>
            <strong style={{ color: relation.color }}>{relation.label}</strong>
            <em>→</em>
            <span>{relation.to}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}

export function HowItWorks() {
  return (
    <section className="lp-narrow-section">
      <SectionHeading eyebrow="HOW IT WORKS" title="세 단계면 끝" />
      <div className="lp-steps">
        {STEPS.map((step) => (
          <StepBlock key={step.number} {...step} />
        ))}
      </div>
    </section>
  );
}

function StepBlock({
  number,
  title,
  desc,
  delay,
}: {
  number: string;
  title: string;
  desc: string;
  delay: number;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(timeout);
  }, [delay]);

  return (
    <div className={visible ? "lp-step is-visible" : "lp-step"}>
      <div className="lp-step-number">{number}</div>
      <div>
        <h3>{title}</h3>
        <p>{desc}</p>
      </div>
    </div>
  );
}

export function PainPointSection() {
  return (
    <section className="lp-card-section">
      <div className="lp-pain-card">
        <div className="lp-pain-icon">😩</div>
        <h3>이런 경험 있지 않나요?</h3>
        <div className="lp-pain-list">
          {PAIN_POINTS.map((pain) => (
            <div key={pain}>{pain}</div>
          ))}
        </div>
        <strong>Smart Writer가 이 문제를 해결합니다.</strong>
      </div>
    </section>
  );
}

export function FeaturesSection() {
  return (
    <section className="lp-feature-section">
      <SectionHeading eyebrow="FEATURES" title="집필에 집중하기 위한 기능" />
      <div className="lp-feature-grid">
        {FEATURES.map((feature) => (
          <article
            className="lp-feature"
            key={feature.title}
            style={
              {
                "--feature-color": feature.color,
              } as React.CSSProperties
            }
          >
            <span>{feature.icon}</span>
            <h3>{feature.title}</h3>
            <p>{feature.desc}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function FinalCta() {
  return (
    <section className="lp-final">
      <div>
        <h2>
          설정 기억은 Smart Writer에게,
          <br />
          글쓰기는 당신에게.
        </h2>
        <p>
          지금 시작하면, 첫 챕터를 저장하는 순간
          <br />
          작품 기억이 채워지는 걸 경험할 수 있습니다.
        </p>
        <Link className="lp-button lp-button-lg" href="/login">
          무료로 시작하기 →
        </Link>
      </div>
    </section>
  );
}

export function LandingFooter() {
  return <footer className="lp-footer">© 2026 Smart Writer · 웹소설 작가를 위한 작품 기억 도구</footer>;
}

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="lp-section-heading">
      <span>{eyebrow}</span>
      <h2>{title}</h2>
    </div>
  );
}
