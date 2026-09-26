type Props = { mood?: 'idle' | 'think' };

export function Mascot({ mood = 'idle' }: Props) {
  return <img className={mood === 'think' ? 'mascot think' : 'mascot'} src="/mascot.png" alt="" />;
}
