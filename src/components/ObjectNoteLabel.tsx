interface ObjectNoteLabelProps {
  note?: string;
  selected?: boolean;
}

export function ObjectNoteLabel({ note, selected }: ObjectNoteLabelProps) {
  const text = note?.trim();
  if (!text) return null;

  return (
    <div className={`obj-chart-note ${selected ? "is-selected" : ""}`} aria-hidden>
      {text}
    </div>
  );
}
