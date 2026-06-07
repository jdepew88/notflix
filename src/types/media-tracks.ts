export interface StreamTrack {
  index: number;
  type: "audio" | "subtitle";
  codec: string;
  language?: string;
  title?: string;
  default?: boolean;
  forced?: boolean;
  channels?: number;
  label: string;
}

export interface ProbeResult {
  format: string;
  duration?: number;
  audio: StreamTrack[];
  subtitles: StreamTrack[];
  needsTranscode: boolean;
  defaultAudioIndex?: number;
  defaultSubtitleIndex?: number | null;
}
