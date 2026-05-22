/** Al Brooks 标注顺序提示（来自课程笔记） */
export function AnnotationGuide() {
  return (
    <section className="annotation-guide" aria-label="标注流程提示">
      <h3>标注流程</h3>
      <ol className="annotation-guide-list">
        <li>
          <span className="annotation-guide-step">3</span>
          <div className="annotation-guide-body">
            <strong>Begin with lines</strong>
            <span className="annotation-guide-terms">Wedge · DT · DB · Triangle</span>
            <small>先用楔形线，再标形态文字</small>
          </div>
        </li>
        <li>
          <span className="annotation-guide-step">4</span>
          <div className="annotation-guide-body">
            <strong>Special Bars</strong>
            <span className="annotation-guide-terms">Big bars · ii · OO · ioi</span>
            <small>拖文字标签到对应 K 线</small>
          </div>
        </li>
        <li>
          <span className="annotation-guide-step">5</span>
          <div className="annotation-guide-body">
            <strong>Add boxes for entries</strong>
            <span className="annotation-guide-terms">and text boxes</span>
            <small>小/高方框标入场 · 文字写逻辑</small>
          </div>
        </li>
      </ol>
    </section>
  );
}
