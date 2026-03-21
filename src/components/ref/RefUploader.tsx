"use client";

import { useRef } from "react";

interface RefUploaderProps {
  hasImages: boolean;
  onFilesSelected: (base64Images: string[]) => void;
}

export function RefUploader({ hasImages, onFilesSelected }: RefUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const promises = Array.from(files).map(
      (file) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        })
    );

    Promise.all(promises).then((results) => {
      onFilesSelected(results);
    });

    e.target.value = "";
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        className="px-3 py-1.5 text-xs border rounded-lg hover:bg-accent transition-colors min-h-[36px]"
      >
        {hasImages ? "添加更多" : "上传参考图"}
      </button>
    </>
  );
}
