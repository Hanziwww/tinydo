import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Minimize2, Square, X } from "lucide-react";
import { useSettingsStore } from "@/stores/settingsStore";

interface Props {
  onMiniMode?: () => void;
}

export function TitleBar({ onMiniMode }: Props) {
  const win = getCurrentWindow();
  const theme = useSettingsStore((s) => s.theme);
  const logoSrc = theme === "dark" ? "/icons/tinydo-logo-dark.svg" : "/icons/tinydo-logo-light.svg";

  return (
    <div
      className="flex h-9 shrink-0 select-none items-center border-b border-border bg-surface-1 pl-5 pr-2"
      onMouseDown={() => win.startDragging()}
    >
      <div className="flex items-center gap-2" onMouseDown={(e) => e.stopPropagation()}>
        <img src={logoSrc} alt="TinyDo" className="h-5 w-5 shrink-0" />
        <span className="text-[13px] font-bold tracking-tight text-text-3">TinyDo</span>
      </div>

      <div className="flex-1" />

      <div className="flex items-center" onMouseDown={(e) => e.stopPropagation()}>
        {onMiniMode && (
          <button
            type="button"
            className="flex h-8 w-10 items-center justify-center text-text-3 transition-colors hover:bg-accent/10 hover:text-accent"
            onClick={onMiniMode}
            title="Mini Mode"
          >
            <Minimize2 size={13} />
          </button>
        )}
        <button
          type="button"
          className="flex h-8 w-10 items-center justify-center text-text-3 transition-colors hover:bg-surface-2/80 hover:text-text-1"
          onClick={() => win.minimize()}
        >
          <Minus size={14} />
        </button>
        <button
          type="button"
          className="flex h-8 w-10 items-center justify-center text-text-3 transition-colors hover:bg-surface-2/80 hover:text-text-1"
          onClick={() => win.toggleMaximize()}
        >
          <Square size={11} />
        </button>
        <button
          type="button"
          className="flex h-8 w-10 items-center justify-center text-text-3 transition-colors hover:bg-danger hover:text-white"
          onClick={() => win.close()}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
