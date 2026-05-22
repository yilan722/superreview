import { useEffect } from "react";

interface ImagePreviewModalProps {
  open: boolean;
  title: string;
  image: string;
  onClose: () => void;
}

export function ImagePreviewModal({ open, title, image, onClose }: ImagePreviewModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="image-preview-modal" role="dialog" aria-modal="true" aria-label={`${title} 放大`}>
      <button
        type="button"
        className="image-preview-backdrop"
        aria-label="关闭"
        onClick={onClose}
      />
      <div className="image-preview-panel">
        <header className="image-preview-header">
          <h3>{title}</h3>
          <button type="button" className="image-preview-close" onClick={onClose}>
            退出全屏
          </button>
        </header>
        <div className="image-preview-body">
          <img src={image} alt={title} className="image-preview-img" draggable={false} />
        </div>
      </div>
    </div>
  );
}
