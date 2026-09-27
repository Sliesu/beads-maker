type Props = { mood?: 'idle' | 'think' };

export function Mascot({ mood = 'idle' }: Props) {
  return <img className={mood === 'think' ? 'mascot think' : 'mascot'} src={`${import.meta.env.BASE_URL}mascot.png`} alt="" />;
}
