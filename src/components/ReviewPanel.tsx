interface ReviewPanelProps {
  sessionTitle: string;
  reviewNotes: string;
  selectedNote: string;
  onTitleChange: (v: string) => void;
  onNotesChange: (v: string) => void;
  onSelectedNoteChange: (v: string) => void;
}

export function ReviewPanel({
  sessionTitle,
  reviewNotes,
  selectedNote,
  onTitleChange,
  onNotesChange,
  onSelectedNoteChange,
}: ReviewPanelProps) {
  return (
    <aside className="review-panel">
      <header>
        <h2>复盘笔记</h2>
        <p>Al Brooks 式：逐根 K 线写清 setup、背景、入场逻辑</p>
      </header>
      <label className="field">
        <span>本次复盘</span>
        <input
          type="text"
          placeholder="例：ES 5m — 2026-05-16 开盘区间"
          value={sessionTitle}
          onChange={(e) => onTitleChange(e.target.value)}
        />
      </label>
      <label className="field">
        <span>整体复盘（右侧可拖到图上）</span>
        <textarea
          value={reviewNotes}
          onChange={(e) => onNotesChange(e.target.value)}
          rows={14}
        />
      </label>
      <label className="field">
        <span>选中对象的备注（显示在图上对象下方）</span>
        <textarea
          placeholder="选中图上某个标注后，在这里写备注，会显示在对象正下方…"
          value={selectedNote}
          onChange={(e) => onSelectedNoteChange(e.target.value)}
          rows={5}
        />
      </label>
      <div className="review-tips">
        <strong>标签速查</strong>
        <ul>
          <li><em>H1/H2, L1/L2</em> — 回调第 1/2 次突破</li>
          <li><em>Bull Maj Surp, Spike</em> — 惊喜 K / 尖峰</li>
          <li><em>AIL / AIS</em> — Always In 多/空</li>
          <li><em>MTR, HL MTR</em> — 重大趋势反转</li>
          <li><em>Trunc Wedge, DT LH</em> — 截断楔形 / 双顶更低</li>
          <li><em>TR, EMA Test</em> — 震荡区 / 回踩均线</li>
        </ul>
      </div>
    </aside>
  );
}
