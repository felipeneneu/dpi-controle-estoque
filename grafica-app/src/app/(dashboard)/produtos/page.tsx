"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ProdutosPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/estoque");
  }, [router]);

  return null;
}