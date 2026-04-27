"use client";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function ClientsSearch({ defaultQ, defaultSort, total, showing }: { defaultQ?: string; defaultSort?: string; total: number; showing: number; }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(defaultQ ?? "");
  const [sort, setSort] = useState(defaultSort ?? "name");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (q) { params.set("q", q); } else { params.delete("q"); }
      params.set("sort", sort);
      router.push(`${pathname}?${params.toString()}`);
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [q, sort]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2 items-center">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, email, phone... results appear instantly" className="max-w-md" autoComplete="off" autoFocus />
        <select value={sort} onChange={(e) => setSort(e.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm">
          <option value="name">Sort: Name</option>
          <option value="visits">Sort: Most visits</option>
          <option value="noshows">Sort: Most no-shows</option>
          <option value="joined">Sort: Recently joined</option>
        </select>
        {q && <Button variant="ghost" size="sm" onClick={() => setQ("")}>Clear</Button>}
        <span className="text-xs text-muted-foreground ml-auto">{total.toLocaleString()} client{total === 1 ? "" : "s"}{showing < total ? ` · showing ${showing}` : ""}</span>
      </div>
      <p className="text-xs text-muted-foreground">Tip: type <code>043</code> to find all 043 numbers instantly. Combine e.g. <code>john 0412</code> to narrow.</p>
    </div>
  );
}
