import { useRef } from "react";
import type { ContextSlot } from "../types";

interface ContextImagePaneProps {
  slot: ContextSlot;
  label: string;
  image: string | null;
  active: boolean;
  onActivate: () => void;
  onImageChange: (dataUrl: string | null) => void;
  onExpand: () => void;
}

export function ContextImagePane({
  slot,
  label,
  image,
  active,
  onActivate,
  onImageChange,
  onExpand,
}: ContextImagePaneProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  const loadFile = (file: File | undefined) => {
    if (!file?.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => onImageChange(reader.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <div
      className={`context-pane ${active ? "is-active" : ""} ${image ? "has-image" : "empty"}`}
      data-slot={slot}
      onPointerDown={onActivate}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const file = e.dataTransfer.files?.[0];
        if (file) loadFile(file);
      }}
    >
      <div className="context-pane-head">
        <span className="context-pane-label">{label}</span>
        <div className="context-pane-actions">
          <button
            type="button"
            className="context-pane-btn"
            onClick={(e) => {
              e.stopPropagation();
              fileRef.current?.click();
            }}
          >
            {image ? "换图" : "上传"}
          </button>
          {image && (
            <>
              <button
                type="button"
                className="context-pane-btn context-pane-btn-zoom"
                onClick={(e) => {
                  e.stopPropagation();
                  onExpand();
                }}
              >
                放大
              </button>
              <button
                type="button"
                className="context-pane-btn context-pane-btn-clear"
                onClick={(e) => {
                  e.stopPropagation();
                  onImageChange(null);
                }}
              >
                清除
              </button>
            </>
          )}
        </div>
      </div>
      <div
        className="context-pane-body"
        onClick={() => !image && fileRef.current?.click()}
      >
        {image ? (
          <img src={image} alt={label} className="context-pane-img" draggable={false} />
        ) : (
          <span className="context-pane-placeholder">拖入或点击上传</span>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          loadFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
