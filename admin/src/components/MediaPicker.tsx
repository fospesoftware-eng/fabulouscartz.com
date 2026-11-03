import { useState } from "react";
import { Check, Images, Search } from "lucide-react";
import type { MediaAsset } from "../../shared/types";
import { Modal } from "./overlay";
import { Button, EmptyState, SearchInput } from "./ui";
import { api } from "../lib/api";
import { useResource } from "../lib/hooks";
import { cn } from "../lib/utils";

export function MediaPicker({
  open,
  onClose,
  onSelect,
  selected = [],
  multiple = true,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (urls: string[]) => void;
  selected?: string[];
  multiple?: boolean;
}) {
  const [q, setQ] = useState("");
  const [folder, setFolder] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const media = useResource<{ data: MediaAsset[]; folders: string[] }>(
    () => api.get<{ data: MediaAsset[]; folders: string[] }>("/media"),
    [],
    { enabled: open },
  );

  const filtered = (media.data?.data ?? []).filter((asset) => {
    if (folder && asset.folder !== folder) return false;
    if (!q) return true;
    return `${asset.name} ${asset.folder}`.toLowerCase().includes(q.toLowerCase());
  });

  const toggle = (url: string) => {
    setPicked((current) => {
      if (current.includes(url)) return current.filter((entry) => entry !== url);
      return multiple ? [...current, url] : [url];
    });
  };

  const confirm = () => {
    if (picked.length === 0) return;
    onSelect(picked);
    setPicked([]);
    setQ("");
    setFolder("");
    onClose();
  };

  const display = picked.length ? picked : selected;

  return (
    <Modal
      open={open}
      onClose={() => {
        setPicked([]);
        onClose();
      }}
      title="Media library"
      description="Curated imagery already optimised for the storefront. Select one or more frames."
      size="lg"
      footer={
        <>
          <span className="hint grow">{display.length} selected</span>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!picked.length} onClick={confirm} icon={<Check size={14} />}>
            Use selection
          </Button>
        </>
      }
    >
      <div className="media-toolbar">
        <SearchInput value={q} onChange={setQ} placeholder="Search file or folder…" className="grow" />
        <select className="select input-sm" value={folder} onChange={(event) => setFolder(event.target.value)} aria-label="Filter folder">
          <option value="">All folders</option>
          {media.data?.folders.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      {media.error ? (
        <EmptyState icon={<Search size={20} />} title="Media unavailable" body={media.error} />
      ) : media.loading && !media.data ? (
        <div className="media-grid">
          {Array.from({ length: 12 }).map((_, index) => (
            <div key={index} className="sk sk-block" style={{ aspectRatio: "4 / 5", borderRadius: 10 }} />
          ))}
        </div>
      ) : filtered.length ? (
        <div className="media-grid">
          {filtered.map((asset) => {
            const isSelected = display.includes(asset.url);
            return (
              <button
                key={asset.url}
                type="button"
                className={cn("media-tile", isSelected && "is-selected")}
                onClick={() => toggle(asset.url)}
                aria-pressed={isSelected}
                title={asset.name}
              >
                <img src={asset.url} alt={asset.name} loading="lazy" />
                <span>{asset.name}</span>
                {isSelected ? (
                  <span className="media-check">
                    <Check size={11} />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : (
        <EmptyState icon={<Images size={22} />} title="Nothing in this corner" body="Try another folder or clear the search." />
      )}
    </Modal>
  );
}
