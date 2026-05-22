interface ObjectToolbarProps {
  onDelete: () => void;
}

export function ObjectToolbar({ onDelete }: ObjectToolbarProps) {
  return (
    <div className="obj-toolbar" onPointerDown={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="obj-toolbar-delete"
        title="删除 (Del)"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
      >
        删除
      </button>
    </div>
  );
}
