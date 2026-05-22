/** 新建复盘时的默认笔记骨架（可直接在各行下方填写） */
export const DEFAULT_REVIEW_NOTES = `背景 trend / TR？


关键位：Yest H/L, 开盘, TR HL


Setup：H2, Wedge, MTR...


入场 / 止损 / 目标


若重来会怎么做？
`;

export function reviewNotesOrDefault(notes: string | undefined | null): string {
  return notes?.trim() ? notes : DEFAULT_REVIEW_NOTES;
}
