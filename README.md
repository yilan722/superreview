# Trade Review — Candle by Candle

在 K 线截图上拖放 Al Brooks 式标注对象，并写复盘笔记（参考 [Write on Charts](https://www.youtube.com/watch?v=AGyOld9iY8U)）。

## 使用

```bash
npm install
npm run dev
```

浏览器打开终端里显示的地址（一般是 http://localhost:5173）。

1. **上传 / 粘贴 / 拖放** K 线截图到中间画布  
2. 从**右侧工具栏**把标签、色块、水平线、箭头拖到图上  
3. 在**左侧**写整体复盘；选中某个标注后可在「选中对象的备注」里写说明  
4. **导出 PNG** 保存带标注的图  

数据会自动保存在浏览器 `localStorage`。

## 快捷键

- `Delete` / `Backspace`：删除选中的标注（焦点不在输入框时）
- 双击文字标签：编辑文字
