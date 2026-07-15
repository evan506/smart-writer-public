import { Loader2, Wand2, XCircle } from "lucide-react";

export function AnalysisFailedState() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", padding: "32px 0", textAlign: "center" }}>
      <XCircle size={22} style={{ color: "var(--sw-danger)" }} />
      <div>
        <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--sw-text-muted)", marginBottom: "4px" }}>기억 후보 찾기에 실패했습니다</p>
        <p style={{ fontSize: "11px", color: "var(--sw-text-ghost)" }}>챕터를 다시 저장하면 설정 후보와 세부 설정 후보를 다시 찾습니다</p>
      </div>
    </div>
  );
}

export function AnalyzingState() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", padding: "32px 0", textAlign: "center" }}>
      <Loader2 size={20} className="animate-spin" style={{ color: "var(--sw-accent)" }} />
      <div>
        <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--sw-text-muted)", marginBottom: "4px" }}>작품 기억을 정리하는 중입니다</p>
        <p style={{ fontSize: "11px", color: "var(--sw-text-ghost)" }}>저장한 장면에서 인물, 장소, 관계, 세부 설정을 찾고 있습니다</p>
      </div>
    </div>
  );
}

export function LoadingState() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", padding: "32px 0", textAlign: "center" }}>
      <Loader2 size={16} className="animate-spin" style={{ color: "var(--sw-text-ghost)" }} />
      <p style={{ fontSize: "11px", color: "var(--sw-text-ghost)" }}>후보 검토함을 불러오는 중입니다</p>
    </div>
  );
}

export function EmptyState({
  autoRegisteredEntityCount,
  autoRegisteredRelationCount,
  autoRegisteredNames,
  analysisCompletedWithoutResults,
}: {
  autoRegisteredEntityCount: number;
  autoRegisteredRelationCount: number;
  autoRegisteredNames: string[];
  analysisCompletedWithoutResults: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", padding: "32px 0", textAlign: "center" }}>
      <Wand2 size={24} style={{ color: "var(--sw-text-ghost)", opacity: 0.4 }} />
      {autoRegisteredEntityCount > 0 || autoRegisteredRelationCount > 0 ? (
        <>
          {autoRegisteredEntityCount > 0 ? (
            <p style={{ fontSize: "12px", fontWeight: 700, color: "var(--sw-accent)" }}>
              {autoRegisteredEntityCount}개 설정을 작품 기억에 저장했습니다
            </p>
          ) : (
            <p style={{ fontSize: "12px", fontWeight: 700, color: "var(--sw-accent)" }}>
              관계 {autoRegisteredRelationCount}개를 작품 기억에 저장했습니다
            </p>
          )}
          {autoRegisteredRelationCount > 0 && (
            <p style={{ fontSize: "11px", color: "var(--sw-text-muted)" }}>
              {autoRegisteredEntityCount > 0
                ? `관계 ${autoRegisteredRelationCount}개도 함께 기억했습니다`
                : "확인이 필요한 새 설정은 없습니다"}
            </p>
          )}
          {autoRegisteredNames.length > 0 && (
            <p style={{ fontSize: "11px", color: "var(--sw-text-ghost)", opacity: 0.85 }}>
              {autoRegisteredNames.join(", ")}
            </p>
          )}
          <p style={{ fontSize: "11px", color: "var(--sw-text-ghost)", opacity: 0.7 }}>
            확인이 필요한 새 항목은 없습니다
          </p>
        </>
      ) : analysisCompletedWithoutResults ? (
        <>
          <p style={{ fontSize: "12px", fontWeight: 700, color: "var(--sw-text-muted)" }}>
            후보 찾기가 완료되었습니다
          </p>
          <p style={{ fontSize: "11px", color: "var(--sw-text-ghost)", opacity: 0.7 }}>
            새로 기억하거나 확인할 항목은 없습니다
          </p>
        </>
      ) : (
        <>
          <p style={{ fontSize: "12px", color: "var(--sw-text-ghost)" }}>아직 확인할 설정 후보가 없습니다</p>
          <p style={{ fontSize: "11px", color: "var(--sw-text-ghost)", opacity: 0.7 }}>챕터를 저장하면 작품 기억에 남길 항목과 세부 설정을 찾아드립니다</p>
        </>
      )}
    </div>
  );
}
