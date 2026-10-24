"use client";

import { useState } from "react";
import { FuriganaText } from "@/components/furigana-text";
import { playCorrectSound, playIncorrectSound } from "@/lib/audio-feedback";

function Result({ ok }: { ok: boolean | null }) {
  return ok === null ? null : (
    <p
      className="tag"
      role="status"
      aria-live="polite"
      style={{
        background: ok ? "var(--green-light)" : "var(--red-light)",
        color: ok ? "var(--green)" : "var(--red)",
        fontSize: 14,
        padding: "8px 14px",
      }}
    >
      {ok ? "✓ Chính xác!" : "✗ Chưa đúng, thử lại nhé."}
    </p>
  );
}

export function QuizPractice() {
  const [choice, setChoice] = useState("");
  const [checked, setChecked] = useState(false);
  const [animClass, setAnimClass] = useState("");
  const options = ["Hôm nay trời hơi lạnh.", "Ngày mai trời nóng.", "Hôm nay trời rất đẹp."];

  function verify() {
    setChecked(true);
    if (choice === options[0]) {
      playCorrectSound();
      setAnimClass("animate-success");
    } else {
      playIncorrectSound();
      setAnimClass("animate-shake");
    }
  }

  return (
    <section className={`card stack ${animClass}`}>
      <div className="eyebrow">CÂU HỎI MẪU TỰ BIÊN</div>
      <div className="jp" lang="ja" style={{ fontSize: 32, lineHeight: 1.8 }}>
        <FuriganaText text="今日は少し寒いです。" />
      </div>
      <p className="muted">Chọn nghĩa phù hợp với câu trên.</p>
      {options.map(option => (
        <button
          key={option}
          type="button"
          aria-pressed={choice === option}
          className={`btn ${choice === option ? "" : "secondary"}`}
          style={{ justifyContent: "flex-start", textAlign: "left" }}
          onClick={() => {
            setChoice(option);
            setChecked(false);
            setAnimClass("");
          }}
        >
          {option}
        </button>
      ))}
      {checked && <Result ok={choice === options[0]} />}
      <button className="btn" type="button" disabled={!choice} onClick={verify}>
        Kiểm tra
      </button>
    </section>
  );
}

export function SentenceBuilder() {
  const bank = ["コーヒー", "のみます", "わたし", "を", "は"];
  const answer = ["わたし", "は", "コーヒー", "を", "のみます"];
  const [selected, setSelected] = useState<number[]>([]);
  const [checked, setChecked] = useState(false);
  const [animClass, setAnimClass] = useState("");
  const words = selected.map(i => bank[i]);
  const correct = words.join(" ") === answer.join(" ");

  function verify() {
    setChecked(true);
    if (correct) {
      playCorrectSound();
      setAnimClass("animate-success");
    } else {
      playIncorrectSound();
      setAnimClass("animate-shake");
    }
  }

  return (
    <section className={`card stack ${animClass}`}>
      <div className="eyebrow">CÂU MẪU TỰ BIÊN</div>
      <p className="muted">Chọn các thẻ theo thứ tự để tạo câu: “Tôi uống cà phê.”</p>
      <div
        className="card jp"
        lang="ja"
        style={{ minHeight: 72, fontSize: 24, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}
      >
        {selected.length === 0 && <span className="muted" style={{ fontSize: 16 }}>Chọn các từ bên dưới...</span>}
        {selected.map((id, i) => (
          <button
            key={`${id}-${i}`}
            type="button"
            className="tag jp"
            lang="ja"
            style={{ fontSize: 18, padding: "8px 14px", cursor: "pointer" }}
            aria-label={`Bỏ chọn ${bank[id]}`}
            onClick={() => {
              setSelected(v => v.filter((_, n) => n !== i));
              setChecked(false);
              setAnimClass("");
            }}
          >
            <FuriganaText text={bank[id]} /> ✕
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {bank.map((word, id) => (
          <button
            key={id}
            type="button"
            className="btn secondary jp"
            lang="ja"
            style={{ fontSize: 18 }}
            aria-label={`Chọn ${word}`}
            disabled={selected.includes(id)}
            onClick={() => {
              setSelected(v => [...v, id]);
              setChecked(false);
              setAnimClass("");
            }}
          >
            <FuriganaText text={word} />
          </button>
        ))}
      </div>
      <div className="muted jp" lang="ja">
        Câu của bạn: {words.join(" ")}
      </div>
      {checked && <Result ok={correct} />}
      <div style={{ display: "flex", gap: 10 }}>
        <button className="btn" type="button" disabled={selected.length !== answer.length} onClick={verify}>
          Kiểm tra câu
        </button>
        <button
          className="btn secondary"
          type="button"
          onClick={() => {
            setSelected([]);
            setChecked(false);
            setAnimClass("");
          }}
        >
          Làm lại
        </button>
      </div>
    </section>
  );
}

export function ParticlePractice() {
  const [choice, setChoice] = useState("");
  const [checked, setChecked] = useState(false);
  const [animClass, setAnimClass] = useState("");

  function verify() {
    setChecked(true);
    if (choice === "は") {
      playCorrectSound();
      setAnimClass("animate-success");
    } else {
      playIncorrectSound();
      setAnimClass("animate-shake");
    }
  }

  return (
    <section className={`card stack ${animClass}`}>
      <div className="eyebrow">LUYỆN TRỢ TỪ · CÂU MẪU TỰ BIÊN</div>
      <p className="muted">Chọn trợ từ phù hợp để hoàn thành câu.</p>
      <div className="jp" lang="ja" style={{ fontSize: 32, lineHeight: 1.8 }}>
        きょう <strong style={{ color: "var(--red)", textDecoration: "underline" }}>{choice || "＿"}</strong>{" "}
        <FuriganaText text="あめがふっています。" />
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        {["は", "を", "で"].map(value => (
          <button
            className={`btn ${choice === value ? "" : "secondary"} jp`}
            lang="ja"
            style={{ minWidth: 60, fontSize: 20 }}
            key={value}
            type="button"
            aria-pressed={choice === value}
            aria-label={`Trợ từ ${value}`}
            onClick={() => {
              setChoice(value);
              setChecked(false);
              setAnimClass("");
            }}
          >
            {value}
          </button>
        ))}
      </div>
      {checked && <Result ok={choice === "は"} />}
      <button className="btn" type="button" disabled={!choice} onClick={verify}>
        Kiểm tra trợ từ
      </button>
    </section>
  );
}
