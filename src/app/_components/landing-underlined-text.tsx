import type React from "react";
import type { TEXT_ENTITIES } from "./landing-page-data";

export function UnderlinedText({
  text,
  entities,
}: {
  text: string;
  entities: typeof TEXT_ENTITIES;
}) {
  const result: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    let earliest: (typeof entities)[number] | null = null;
    let earliestIdx = remaining.length;

    for (const entity of entities) {
      const idx = remaining.indexOf(entity.name);
      if (idx !== -1 && idx < earliestIdx) {
        earliestIdx = idx;
        earliest = entity;
      }
    }

    if (!earliest) {
      result.push(<span key={key++}>{remaining}</span>);
      break;
    }

    if (earliestIdx > 0) {
      result.push(<span key={key++}>{remaining.slice(0, earliestIdx)}</span>);
    }
    result.push(
      <span
        key={key++}
        style={{
          borderBottom: `2px solid ${earliest.color}`,
          paddingBottom: "1px",
        }}
      >
        {earliest.name}
      </span>
    );
    remaining = remaining.slice(earliestIdx + earliest.name.length);
  }

  return <>{result}</>;
}
