import { useRef, useState } from 'react';

interface Props {
  title: string;
  author: string;
  src: string;
  cover?: string;
}

/**
 * 一个最小的 React 音乐播放器，用来演示在文章（.mdx）里直接嵌入交互组件。
 * 只有真正用到它的页面才会加载这段 JS（Astro 的 island 机制）。
 */
export default function MusicPlayer({ title, author, src, cover }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
    } else {
      void el.play();
    }
    setPlaying(!playing);
  };

  return (
    <div className="music-player">
      {cover && <img className="music-player__cover" src={cover} alt={title} />}
      <div className="music-player__body">
        <div className="music-player__meta">
          <strong>{title}</strong>
          <span>{author}</span>
        </div>
        <button type="button" className="music-player__btn" onClick={toggle}>
          {playing ? '暂停' : '播放'}
        </button>
        <audio
          ref={audioRef}
          src={src}
          onEnded={() => setPlaying(false)}
          preload="none"
        />
      </div>
    </div>
  );
}
