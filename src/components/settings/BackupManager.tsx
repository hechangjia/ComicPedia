import { useState } from "react";

interface BackupManagerProps {
  className?: string;
}

/**
 * BackupManager — User data export/import UI.
 * Allows users to backup their comics, characters, and series to JSON.
 */
export function BackupManager({ className }: BackupManagerProps) {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleExport = async (stripImages: boolean) => {
    setExporting(true);
    setMessage(null);
    try {
      const url = `/api/backup/export${stripImages ? "?strip_images=true" : ""}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Export failed");

      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `comicpedia-backup-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(downloadUrl);

      setMessage({ type: "success", text: "Backup exported successfully" });
    } catch (err) {
      console.error("Export failed:", err);
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Export failed" });
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setMessage(null);
    try {
      const text = await file.text();
      const backup = JSON.parse(text);

      const res = await fetch("/api/backup/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(backup),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Import failed");
      }

      const result = await res.json();
      setMessage({
        type: "success",
        text: `Imported ${result.imported.tasks} comics, ${result.imported.characters} characters, ${result.imported.series} series`,
      });

      // Reload page to refresh data
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      console.error("Import failed:", err);
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Import failed" });
    } finally {
      setImporting(false);
      // Reset file input
      event.target.value = "";
    }
  };

  return (
    <div className={className}>
      <h3 className="text-lg font-semibold mb-3">Data Backup</h3>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Export your comics, characters, and series to a JSON file. You can commit this file to git for version control.
      </p>

      <div className="flex flex-wrap gap-3 mb-4">
        <button
          onClick={() => handleExport(false)}
          disabled={exporting || importing}
          className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {exporting ? "Exporting..." : "Export Full Backup"}
        </button>
        <button
          onClick={() => handleExport(true)}
          disabled={exporting || importing}
          className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Export Metadata Only
        </button>
        <label className="inline-block">
          <input
            type="file"
            accept=".json"
            onChange={handleImport}
            disabled={exporting || importing}
            className="hidden"
          />
          <span
            className={`inline-block px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 ${
              exporting || importing ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
            }`}
          >
            {importing ? "Importing..." : "Import Backup"}
          </span>
        </label>
      </div>

      {message && (
        <div
          className={`text-sm p-3 rounded ${
            message.type === "success"
              ? "bg-success/5 text-success bg-success/10"
              : "bg-error/5 text-error bg-error/10"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="mt-4 text-xs text-gray-500 dark:text-gray-500">
        <p className="mb-1">
          <strong>Full Backup:</strong> Includes all images (large file, ~10-50MB per comic).
        </p>
        <p>
          <strong>Metadata Only:</strong> Excludes images (small file, suitable for git commits).
        </p>
      </div>
    </div>
  );
}
