"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function TintasPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/estoque?cat=INK_SUPPLY");
  }, [router]);

  return null;
}
