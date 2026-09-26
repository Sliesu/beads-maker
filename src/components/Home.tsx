import { Mascot } from './Mascot';

type Props = {
  hasDraft: boolean;
  onPick: () => void;
  onSample: () => void;
  onContinue: () => void;
  onAbout: () => void;
};

export function Home({ hasDraft, onPick, onSample, onContinue, onAbout }: Props) {
  return (
    <section className="screen home">
      <div className="home-main">
        <Mascot />
        <h1>豆豆丸</h1>
        <p>照片进来，变成能拼的图纸</p>
        <div className="step-row" aria-hidden>
          <span>选图</span>
          <i />
          <span>色号</span>
          <i />
          <span>开拼</span>
        </div>
      </div>
      <div className="screen-foot">
        <button className="btn btn-primary btn-block" onClick={onPick}>
          从相册选图
        </button>
        <button className="btn btn-ghost btn-block" onClick={onSample}>
          先看示例
        </button>
        {hasDraft && (
          <button className="text-btn" onClick={onContinue}>
            继续上次的图纸
          </button>
        )}
        <button className="text-btn quiet" onClick={onAbout}>
          这是怎么做的
        </button>
      </div>
    </section>
  );
}
