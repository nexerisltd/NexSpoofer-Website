"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import "./player.css";

type Props =
  | { kind: "hls"; manifestUrl: string; mediaUrl?: undefined; fallback?: undefined }
  | { kind: "direct"; mediaUrl: string; manifestUrl?: undefined; fallback?: ReactNode };

const ICONS = {
  play: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5.5v13l11-6.5-11-6.5Z"/></svg>',
  pause:
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
  back10:
    '<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M6 12a8 8 0 1 1 2.4 5.7M6 12v5M6 12H1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><text x="12" y="15" font-size="7" fill="currentColor" text-anchor="middle" font-family="monospace">10</text></svg>',
  fwd10:
    '<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M18 12a8 8 0 1 0-2.4 5.7M18 12v5M18 12h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><text x="12" y="15" font-size="7" fill="currentColor" text-anchor="middle" font-family="monospace">10</text></svg>',
  volUp:
    '<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M4 9v6h4l5 4V5L8 9H4Z" fill="currentColor"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  volMute:
    '<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M4 9v6h4l5 4V5L8 9H4Z" fill="currentColor"/><path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  settings:
    '<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="m19.4 13-.1-1-.1-1 1.6-1.3-2-3.4-2 .6-1.7-1-.3-2h-4l-.3 2-1.7 1-2-.6-2 3.4L6.3 11l-.1 1 .1 1-1.6 1.3 2 3.4 2-.6 1.7 1 .3 2h4l.3-2 1.7-1 2 .6 2-3.4L19.4 13Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><circle cx="12" cy="12" r="2.6" stroke="currentColor" stroke-width="1.4"/></svg>',
  fsEnter:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 4H5a1 1 0 0 0-1 1v4M15 4h4a1 1 0 0 1 1 1v4M9 20H5a1 1 0 0 1-1-1v-4M15 20h4a1 1 0 0 0 1-1v-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  fsExit:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

function fmt(t: number) {
  if (!isFinite(t) || t < 0) t = 0;
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function Player(props: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const seekRef = useRef<HTMLDivElement>(null);
  const seekPlayedRef = useRef<HTMLDivElement>(null);
  const seekBufferedRef = useRef<HTMLDivElement>(null);
  const seekHandleRef = useRef<HTMLDivElement>(null);
  const centerPlayRef = useRef<HTMLDivElement>(null);
  const spinnerRef = useRef<HTMLDivElement>(null);
  const playBtnRef = useRef<HTMLButtonElement>(null);
  const muteBtnRef = useRef<HTMLButtonElement>(null);
  const volRangeRef = useRef<HTMLInputElement>(null);
  const timeDisplayRef = useRef<HTMLSpanElement>(null);
  const settingsBtnRef = useRef<HTMLButtonElement>(null);
  const settingsMenuRef = useRef<HTMLDivElement>(null);
  const speedOptionsRef = useRef<HTMLDivElement>(null);
  const qualityLabelRef = useRef<HTMLDivElement>(null);
  const qualityOptionsRef = useRef<HTMLDivElement>(null);
  const fsBtnRef = useRef<HTMLButtonElement>(null);

  const [status, setStatus] = useState<string | null>("Preparing stream…");
  const [isImage, setIsImage] = useState(false);
  const [checkingType, setCheckingType] = useState(props.kind === "direct");

  // For "direct" links we don't know client-side whether it's a video or
  // image (the real extension/type was never exposed to the browser) —
  // sniff the actual Content-Type first.
  useEffect(() => {
    if (props.kind !== "direct") return;
    let cancelled = false;
    fetch(props.mediaUrl, { method: "HEAD" })
      .then((res) => {
        if (cancelled) return;
        const ct = res.headers.get("content-type") || "";
        setIsImage(ct.startsWith("image/"));
        setCheckingType(false);
      })
      .catch(() => {
        if (!cancelled) setCheckingType(false);
      });
    return () => {
      cancelled = true;
    };
  }, [props.kind, props.kind === "direct" ? props.mediaUrl : undefined]);

  useEffect(() => {
    if (checkingType || isImage) return;

    const video = videoRef.current!;
    const stage = stageRef.current!;
    const controls = controlsRef.current!;
    const seek = seekRef.current!;
    const seekPlayed = seekPlayedRef.current!;
    const seekBuffered = seekBufferedRef.current!;
    const seekHandle = seekHandleRef.current!;
    const centerPlay = centerPlayRef.current!;
    const spinner = spinnerRef.current!;
    const playBtn = playBtnRef.current!;
    const muteBtn = muteBtnRef.current!;
    const volRange = volRangeRef.current!;
    const timeDisplay = timeDisplayRef.current!;
    const settingsBtn = settingsBtnRef.current!;
    const settingsMenu = settingsMenuRef.current!;
    const speedOptions = speedOptionsRef.current!;
    const qualityLabel = qualityLabelRef.current!;
    const qualityOptions = qualityOptionsRef.current!;
    const fsBtn = fsBtnRef.current!;

    playBtn.innerHTML = ICONS.play;
    muteBtn.innerHTML = ICONS.volUp;
    settingsBtn.innerHTML = ICONS.settings;
    fsBtn.innerHTML = ICONS.fsEnter;
    centerPlay.innerHTML = ICONS.play.replace('width="18" height="18"', 'width="64" height="64"');
    stage.querySelector<HTMLButtonElement>(".backBtn")!.innerHTML = ICONS.back10;
    stage.querySelector<HTMLButtonElement>(".fwdBtn")!.innerHTML = ICONS.fwd10;

    let dragging = false;
    function ratioFromEvent(e: MouseEvent | TouchEvent) {
      const rect = seek.getBoundingClientRect();
      const clientX = "touches" in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
      return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    }
    function paintSeek(ratio: number) {
      const pct = (ratio * 100).toFixed(3) + "%";
      seekPlayed.style.width = pct;
      seekHandle.style.left = pct;
      seek.setAttribute("aria-valuenow", String(Math.round(ratio * 100)));
    }
    function updateSeekFromVideo() {
      if (!video.duration || dragging) return;
      paintSeek(video.currentTime / video.duration);
      if (video.buffered.length) {
        const end = video.buffered.end(video.buffered.length - 1);
        seekBuffered.style.width = Math.min(100, (end / video.duration) * 100) + "%";
      }
    }
    function updateTimeDisplay() {
      timeDisplay.innerHTML = `${fmt(video.currentTime)} <span class="sep">/</span> ${fmt(video.duration)}`;
    }

    const onSeekDown = (e: MouseEvent | TouchEvent) => {
      dragging = true;
      seek.classList.add("dragging");
      const ratio = ratioFromEvent(e);
      paintSeek(ratio);
      if (video.duration) video.currentTime = ratio * video.duration;
    };
    const onSeekMove = (e: MouseEvent | TouchEvent) => {
      if (!dragging) return;
      const ratio = ratioFromEvent(e);
      paintSeek(ratio);
      if (video.duration) video.currentTime = ratio * video.duration;
    };
    const onSeekUp = () => {
      if (!dragging) return;
      dragging = false;
      seek.classList.remove("dragging");
    };

    seek.addEventListener("mousedown", onSeekDown as EventListener);
    window.addEventListener("mousemove", onSeekMove as EventListener);
    window.addEventListener("mouseup", onSeekUp);
    seek.addEventListener("touchstart", onSeekDown as EventListener, { passive: true });
    seek.addEventListener("touchmove", onSeekMove as EventListener, { passive: true });
    seek.addEventListener("touchend", onSeekUp);

    const onSeekKey = (e: KeyboardEvent) => {
      if (!video.duration) return;
      if (e.key === "ArrowRight") video.currentTime = Math.min(video.duration, video.currentTime + 5);
      if (e.key === "ArrowLeft") video.currentTime = Math.max(0, video.currentTime - 5);
    };
    seek.addEventListener("keydown", onSeekKey);

    video.addEventListener("timeupdate", updateSeekFromVideo);
    video.addEventListener("timeupdate", updateTimeDisplay);
    video.addEventListener("progress", updateSeekFromVideo);
    video.addEventListener("loadedmetadata", updateTimeDisplay);
    video.addEventListener("durationchange", updateTimeDisplay);

    let flashTimer: ReturnType<typeof setTimeout>;
    function flashCenter(icon: string) {
      centerPlay.innerHTML = icon.replace('width="18" height="18"', 'width="64" height="64"');
      centerPlay.classList.add("show");
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => centerPlay.classList.remove("show"), 480);
    }
    function togglePlay() {
      if (video.paused) video.play().catch(() => {});
      else video.pause();
    }
    const onPlay = () => {
      playBtn.innerHTML = ICONS.pause;
      showControls();
    };
    const onPause = () => {
      playBtn.innerHTML = ICONS.play;
      showControls(true);
    };
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    playBtn.addEventListener("click", togglePlay);

    const onStageClick = (e: MouseEvent) => {
      if (e.target === video || e.target === stage) {
        togglePlay();
        flashCenter(video.paused ? ICONS.pause : ICONS.play);
      }
    };
    stage.addEventListener("click", onStageClick);

    const backBtn = stage.querySelector<HTMLButtonElement>(".backBtn")!;
    const fwdBtn = stage.querySelector<HTMLButtonElement>(".fwdBtn")!;
    const onBack = () => {
      video.currentTime = Math.max(0, video.currentTime - 10);
    };
    const onFwd = () => {
      video.currentTime = Math.min(video.duration || video.currentTime + 10, video.currentTime + 10);
    };
    backBtn.addEventListener("click", onBack);
    fwdBtn.addEventListener("click", onFwd);

    function updateMuteIcon() {
      muteBtn.innerHTML = video.muted || video.volume === 0 ? ICONS.volMute : ICONS.volUp;
    }
    const onMuteClick = () => {
      video.muted = !video.muted;
      if (!video.muted && video.volume === 0) video.volume = 1;
      volRange.value = String(video.muted ? 0 : video.volume);
      updateMuteIcon();
    };
    const onVolInput = () => {
      video.volume = parseFloat(volRange.value);
      video.muted = video.volume === 0;
      updateMuteIcon();
    };
    muteBtn.addEventListener("click", onMuteClick);
    volRange.addEventListener("input", onVolInput);

    const onWaiting = () => spinner.classList.add("show");
    const onPlaying = () => spinner.classList.remove("show");
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("canplay", onPlaying);

    let settingsOpen = false;
    function closeSettings() {
      settingsOpen = false;
      settingsMenu.classList.remove("open");
    }
    const onSettingsClick = (e: MouseEvent) => {
      e.stopPropagation();
      settingsOpen = !settingsOpen;
      settingsMenu.classList.toggle("open", settingsOpen);
      if (settingsOpen) showControls(true);
    };
    settingsBtn.addEventListener("click", onSettingsClick);
    const onDocClick = (e: MouseEvent) => {
      if (settingsOpen && !stage.querySelector(".settingsWrap")!.contains(e.target as Node)) closeSettings();
    };
    document.addEventListener("click", onDocClick);

    function buildSpeedOptions() {
      speedOptions.innerHTML = "";
      SPEEDS.forEach((rate) => {
        const btn = document.createElement("button");
        btn.className = "settingsOpt" + (video.playbackRate === rate ? " active" : "");
        btn.textContent = rate === 1 ? "Normal" : `${rate}x`;
        btn.addEventListener("click", () => {
          video.playbackRate = rate;
          buildSpeedOptions();
        });
        speedOptions.appendChild(btn);
      });
    }
    video.addEventListener("ratechange", buildSpeedOptions);
    buildSpeedOptions();

    qualityLabel.style.display = "none";
    qualityOptions.style.display = "none";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function buildQualityOptions(hls: any) {
      if (!hls || !hls.levels || !hls.levels.length) return;
      qualityLabel.style.display = "";
      qualityOptions.style.display = "";
      function render() {
        qualityOptions.innerHTML = "";
        const autoBtn = document.createElement("button");
        const isAuto = hls.currentLevel === -1;
        const activeLevel = hls.levels[hls.loadLevel];
        autoBtn.className = "settingsOpt" + (isAuto ? " active" : "");
        autoBtn.textContent = isAuto && activeLevel?.height ? `Auto (${activeLevel.height}p)` : "Auto";
        autoBtn.addEventListener("click", () => {
          hls.currentLevel = -1;
          render();
        });
        qualityOptions.appendChild(autoBtn);

        hls.levels
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((lvl: any, i: number) => ({ i, height: lvl.height }))
          .sort((a: { height: number }, b: { height: number }) => (b.height || 0) - (a.height || 0))
          .forEach(({ i, height }: { i: number; height: number }) => {
            const btn = document.createElement("button");
            btn.className = "settingsOpt" + (hls.currentLevel === i ? " active" : "");
            btn.textContent = height ? `${height}p` : `Level ${i + 1}`;
            btn.addEventListener("click", () => {
              hls.currentLevel = i;
              render();
            });
            qualityOptions.appendChild(btn);
          });
      }
      render();
      hls.on("hlsLevelSwitched", render);
    }

    const onFsClick = () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else stage.requestFullscreen().catch(() => {});
    };
    fsBtn.addEventListener("click", onFsClick);
    const onFsChange = () => {
      fsBtn.innerHTML = document.fullscreenElement ? ICONS.fsExit : ICONS.fsEnter;
    };
    document.addEventListener("fullscreenchange", onFsChange);

    let hideTimer: ReturnType<typeof setTimeout>;
    function showControls(force?: boolean) {
      controls.classList.remove("hidden");
      stage.classList.remove("idle");
      clearTimeout(hideTimer);
      if (!force && !video.paused && !settingsOpen) {
        hideTimer = setTimeout(() => {
          if (!settingsOpen) {
            controls.classList.add("hidden");
            stage.classList.add("idle");
          }
        }, 3000);
      }
    }
    const onMouseMove = () => showControls();
    const onMouseLeave = () => {
      clearTimeout(hideTimer);
      if (!video.paused && !settingsOpen) {
        controls.classList.add("hidden");
        stage.classList.add("idle");
      }
    };
    stage.addEventListener("mousemove", onMouseMove);
    stage.addEventListener("mouseleave", onMouseLeave);
    showControls(true);

    const onKeydown = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || "").toUpperCase();
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowRight":
          video.currentTime = Math.min(video.duration || video.currentTime + 10, video.currentTime + 10);
          break;
        case "ArrowLeft":
          video.currentTime = Math.max(0, video.currentTime - 10);
          break;
        case "m":
          onMuteClick();
          break;
        case "f":
          onFsClick();
          break;
      }
      showControls();
    };
    document.addEventListener("keydown", onKeydown);

    volRange.value = String(video.volume);
    updateMuteIcon();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let hlsInstance: any = null;
    let cancelled = false;

    async function start() {
      if (props.kind === "hls") {
        const HlsMod = (await import("hls.js")).default;
        if (cancelled) return;
        if (HlsMod.isSupported()) {
          const hls = new HlsMod({ maxBufferLength: 30 });
          hlsInstance = hls;
          let networkRetries = 0;
          const MAX_RETRIES = 5;
          hls.on(HlsMod.Events.ERROR, (_evt: unknown, data: { fatal?: boolean; type?: string }) => {
            if (!data?.fatal) return;
            console.error("[NexSpoofer player] fatal hls.js error:", data);
            switch (data.type) {
              case HlsMod.ErrorTypes.NETWORK_ERROR:
                if (networkRetries++ < MAX_RETRIES) {
                  setStatus(`Network hiccup — retrying (${networkRetries}/${MAX_RETRIES})…`);
                  setTimeout(() => hls.startLoad(), 800);
                } else {
                  setStatus("Unable to load this media.");
                }
                break;
              case HlsMod.ErrorTypes.MEDIA_ERROR:
                setStatus("Recovering from a media error…");
                hls.recoverMediaError();
                break;
              default:
                setStatus("Unable to load this media.");
                hls.destroy();
            }
          });
          hls.on(HlsMod.Events.MANIFEST_PARSED, () => {
            setStatus(null);
            buildQualityOptions(hls);
            video.play().catch(() => {});
          });
          hls.loadSource(props.manifestUrl);
          hls.attachMedia(video);
        } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
          video.src = props.manifestUrl;
          setStatus(null);
        } else {
          setStatus("This browser cannot play HLS streams.");
        }
      } else {
        video.src = props.mediaUrl;
        setStatus(null);
      }
    }
    start();

    return () => {
      cancelled = true;
      if (hlsInstance) hlsInstance.destroy();
      seek.removeEventListener("mousedown", onSeekDown as EventListener);
      window.removeEventListener("mousemove", onSeekMove as EventListener);
      window.removeEventListener("mouseup", onSeekUp);
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("keydown", onKeydown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkingType, isImage]);

  if (checkingType) {
    return (
      <main className="stage">
        <div className="glass-card" style={{ maxWidth: 320, textAlign: "center" }}>
          Preparing stream…
        </div>
      </main>
    );
  }
  if (isImage && props.kind === "direct") {
    return <>{props.fallback}</>;
  }

  return (
    <div id="stage" className="player-stage" ref={stageRef}>
      <video id="video" ref={videoRef} playsInline />
      <div className="centerPlay" ref={centerPlayRef} />
      <div className="spinner" ref={spinnerRef} />
      {status && <div className="status">{status}</div>}

      <div className="controls" ref={controlsRef}>
        <div
          className="seek"
          ref={seekRef}
          role="slider"
          tabIndex={0}
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={0}
        >
          <div className="seekTrack" />
          <div className="seekBuffered" ref={seekBufferedRef} />
          <div className="seekPlayed" ref={seekPlayedRef} />
          <div className="seekHandle" ref={seekHandleRef} />
        </div>

        <div className="controlsRow">
          <button className="ctrlBtn" ref={playBtnRef} aria-label="Play" />
          <button className="ctrlBtn backBtn" aria-label="Back 10 seconds" />
          <button className="ctrlBtn fwdBtn" aria-label="Forward 10 seconds" />

          <div className="volGroup">
            <button className="ctrlBtn" ref={muteBtnRef} aria-label="Mute" />
            <div className="volSlider">
              <input ref={volRangeRef} type="range" min={0} max={1} step={0.05} defaultValue={1} aria-label="Volume" />
            </div>
          </div>

          <span className="timeDisplay" ref={timeDisplayRef}>
            0:00 <span className="sep">/</span> 0:00
          </span>

          <div className="spacer" />

          <div className="settingsWrap">
            <button className="ctrlBtn" ref={settingsBtnRef} aria-label="Settings" />
            <div className="settingsMenu" ref={settingsMenuRef}>
              <div className="settingsLabel">Speed</div>
              <div className="settingsSection" ref={speedOptionsRef} />
              <div className="settingsLabel" ref={qualityLabelRef}>
                Quality
              </div>
              <div className="settingsSection" ref={qualityOptionsRef} />
            </div>
          </div>

          <button className="ctrlBtn" ref={fsBtnRef} aria-label="Fullscreen" />
        </div>
      </div>
    </div>
  );
}
