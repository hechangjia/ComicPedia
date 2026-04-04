"use client";

import { useState, useEffect, useCallback } from "react";
import type { Character, CharacterRelation } from "@/lib/types";

export function useRelations() {
  const [relations, setRelations] = useState<CharacterRelation[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [charRes, relRes] = await Promise.all([
        fetch("/api/characters"),
        fetch("/api/relations"),
      ]);
      if (charRes.ok) setCharacters(await charRes.json());
      if (relRes.ok) setRelations(await relRes.json());
    } catch (err) {
      console.error("Failed to load relations data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const addRelation = useCallback(
    async (rel: Partial<CharacterRelation>) => {
      const res = await fetch("/api/relations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rel),
      });
      if (!res.ok) throw new Error("Failed to add relation");
      const data = await res.json();
      setRelations((prev) => {
        const idx = prev.findIndex((r) => r.id === data.relation.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = data.relation;
          return next;
        }
        return [...prev, data.relation];
      });
      return data.relation as CharacterRelation;
    },
    [],
  );

  const updateRelation = useCallback(
    async (id: string, patch: Partial<CharacterRelation>) => {
      const res = await fetch(`/api/relations/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("Failed to update relation");
      const data = await res.json();
      setRelations((prev) =>
        prev.map((r) => (r.id === id ? data.relation : r)),
      );
      return data.relation as CharacterRelation;
    },
    [],
  );

  const deleteRelation = useCallback(async (id: string) => {
    const res = await fetch(`/api/relations/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete relation");
    setRelations((prev) => prev.filter((r) => r.id !== id));
  }, []);

  return {
    relations,
    characters,
    loading,
    addRelation,
    updateRelation,
    deleteRelation,
    reload,
  };
}
