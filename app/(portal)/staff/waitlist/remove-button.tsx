"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { removeWaitlistEntry } from "./actions";

export function RemoveWaitlistButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function remove() {
    start(async () => {
      await removeWaitlistEntry(id);
      router.refresh();
    });
  }

  return (
    <Button size="sm" variant="ghost" onClick={remove} disabled={pending}>
      {pending ? "Removing…" : "Remove"}
    </Button>
  );
}
