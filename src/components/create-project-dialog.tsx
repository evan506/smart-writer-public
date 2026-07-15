"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Loader2 } from "lucide-react";
import { createProject } from "@/app/(dashboard)/projects/actions";
import { toast } from "sonner";

// 장르 정의 — 아이콘 + 값
const GENRE_OPTIONS = [
  { value: "회귀물",    icon: "⏳" },
  { value: "빙의물",    icon: "👤" },
  { value: "헌터물",    icon: "⚔️" },
  { value: "로맨스물",  icon: "💕" },
  { value: "판타지",    icon: "🔮" },
  { value: "무협",      icon: "🥋" },
  { value: "현대판타지", icon: "🏙️" },
  { value: "SF",        icon: "🚀" },
  { value: "기타",      icon: "📚" },
] as const;

// ── 공통 인라인 스타일 ─────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  borderRadius: "8px",
  background: "var(--sw-bg-elevated)",
  border: "1px solid var(--sw-border-default)",
  color: "var(--sw-text-primary)",
  fontSize: "14px",
  outline: "none",
  fontFamily: "var(--sw-font-sans)",
  boxSizing: "border-box",
  transition: "border-color 0.15s",
};

export function CreateProjectDialog() {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [title, setTitle] = useState("");
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [description, setDescription] = useState("");

  function handleClose() {
    setOpen(false);
    // 폼 초기화
    setTitle("");
    setSelectedGenre(null);
    setDescription("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    const formData = new FormData();
    formData.set("title", title.trim());
    if (selectedGenre) formData.set("genre", selectedGenre);
    if (description.trim()) formData.set("description", description.trim());

    setPending(true);
    const result = await createProject(formData);
    setPending(false);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("프로젝트가 생성되었습니다");
      handleClose();
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else setOpen(true); }}>
      <DialogTrigger asChild>
        <button
          suppressHydrationWarning
          style={{
            display: "inline-flex", alignItems: "center", gap: "6px",
            padding: "8px 16px", borderRadius: "8px",
            background: "var(--sw-cta)", color: "#fffaf1",
            fontSize: "13px", fontWeight: 700, cursor: "pointer",
            border: "none", fontFamily: "var(--sw-font-sans)",
            transition: "opacity 0.15s",
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.opacity = "0.88")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.opacity = "1")}
        >
          <Plus size={14} />
          새 프로젝트
        </button>
      </DialogTrigger>

      <DialogContent
        style={{
          background: "var(--sw-bg-surface)",
          border: "1px solid var(--sw-border-default)",
          borderRadius: "16px",
          padding: 0,
          maxWidth: "460px",
          maxHeight: "85vh",
          overflowY: "auto",
        }}
      >
        <DialogTitle className="sr-only">새 프로젝트 만들기</DialogTitle>
        <DialogDescription className="sr-only">
          작품 제목, 장르, 소개를 입력해 새 집필 프로젝트를 만듭니다.
        </DialogDescription>
        {/* Header */}
        <div style={{
          padding: "28px 28px 0",
          background: "linear-gradient(180deg, rgba(79, 140, 92, 0.06) 0%, transparent 100%)",
          borderBottom: "1px solid var(--sw-border-subtle)",
          paddingBottom: "20px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
            <span style={{
              width: 32, height: 32, borderRadius: "8px",
              background: "var(--sw-bg-active)",
              border: "1px solid var(--sw-border-focus)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "14px",
            }}>✦</span>
            <div>
              <div style={{ fontSize: "16px", fontWeight: 800, color: "var(--sw-text-primary)", letterSpacing: "-0.02em" }}>
                새 프로젝트 만들기
              </div>
              <div style={{ fontSize: "11px", color: "var(--sw-text-dim)", marginTop: "2px" }}>
                작품 정보를 입력하면 집필 공간과 작품 기억이 준비됩니다
              </div>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: "24px 28px 28px", display: "flex", flexDirection: "column", gap: "20px" }}>

          {/* 제목 */}
          <div>
            <label style={{
              display: "block", fontSize: "11px", fontWeight: 700,
              color: "var(--sw-text-dim)", letterSpacing: "0.08em",
              textTransform: "uppercase", marginBottom: "8px",
            }}>
              작품 제목 <span style={{ color: "var(--sw-danger)" }}>*</span>
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="제목을 입력하세요"
              required
              autoFocus
              style={inputStyle}
              onFocus={(e) => ((e.target as HTMLInputElement).style.borderColor = "var(--sw-border-focus)")}
              onBlur={(e) => ((e.target as HTMLInputElement).style.borderColor = "var(--sw-border-default)")}
            />
          </div>

          {/* 장르 선택 */}
          <div>
            <label style={{
              display: "block", fontSize: "11px", fontWeight: 700,
              color: "var(--sw-text-dim)", letterSpacing: "0.08em",
              textTransform: "uppercase", marginBottom: "10px",
            }}>
              장르 <span style={{ color: "var(--sw-danger)" }}>*</span>
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "6px" }}>
              {GENRE_OPTIONS.map(({ value, icon }) => {
                const active = selectedGenre === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setSelectedGenre(active ? null : value); }}
                    style={{
                      display: "flex", alignItems: "center", gap: "6px",
                      padding: "8px 10px", borderRadius: "8px",
                      background: active ? "var(--sw-bg-active)" : "var(--sw-bg-elevated)",
                      border: `1px solid ${active ? "var(--sw-border-focus)" : "var(--sw-border-default)"}`,
                      color: active ? "var(--sw-accent)" : "var(--sw-text-muted)",
                      fontSize: "12px", fontWeight: active ? 700 : 500,
                      cursor: "pointer", fontFamily: "var(--sw-font-sans)",
                      transition: "all 0.12s",
                    }}
                    onMouseEnter={(e) => {
                      if (!active) {
                        const b = e.currentTarget;
                        b.style.background = "var(--sw-bg-overlay)";
                        b.style.borderColor = "var(--sw-border-hover)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!active) {
                        const b = e.currentTarget;
                        b.style.background = "var(--sw-bg-elevated)";
                        b.style.borderColor = "var(--sw-border-default)";
                      }
                    }}
                  >
                    <span style={{ fontSize: "13px", lineHeight: 1 }}>{icon}</span>
                    {value}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 설명 */}
          <div>
            <label style={{
              display: "block", fontSize: "11px", fontWeight: 700,
              color: "var(--sw-text-dim)", letterSpacing: "0.08em",
              textTransform: "uppercase", marginBottom: "8px",
            }}>
              작품 소개 <span style={{ fontSize: "10px", fontWeight: 400, color: "var(--sw-text-dim)", textTransform: "none", letterSpacing: 0 }}>(선택)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="간단한 줄거리나 설정을 적어두면 나중에 참고가 됩니다"
              rows={3}
              style={{
                ...inputStyle,
                resize: "none",
                lineHeight: 1.6,
                fontSize: "13px",
              }}
              onFocus={(e) => ((e.target as HTMLTextAreaElement).style.borderColor = "var(--sw-border-focus)")}
              onBlur={(e) => ((e.target as HTMLTextAreaElement).style.borderColor = "var(--sw-border-default)")}
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={pending || !title.trim() || !selectedGenre}
            style={{
              width: "100%", padding: "12px",
              borderRadius: "8px", border: "none",
              background: pending || !title.trim() || !selectedGenre ? "rgba(200,164,110,0.3)" : "var(--sw-cta)",
              color: pending || !title.trim() || !selectedGenre ? "var(--sw-text-dim)" : "#fffaf1",
              fontSize: "14px", fontWeight: 800,
              cursor: pending || !title.trim() || !selectedGenre ? "not-allowed" : "pointer",
              fontFamily: "var(--sw-font-sans)",
              transition: "all 0.15s",
              display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
            }}
          >
            {pending ? (
              <>
                <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                생성 중…
              </>
            ) : (
              <>
                <span style={{ fontSize: "14px" }}>✦</span>
                프로젝트 시작하기
              </>
            )}
          </button>

        </form>
      </DialogContent>
    </Dialog>
  );
}
