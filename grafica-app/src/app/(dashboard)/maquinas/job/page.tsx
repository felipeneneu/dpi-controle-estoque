"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { MimakiJobDetailView } from "@/components/mimaki-job-detail-view"
import { LoadingState } from "@/components/ui/spinner"

function MimakiJobPageContent() {
  const searchParams = useSearchParams()
  const machineId = searchParams.get("machineId") || searchParams.get("machine") || ""
  const jobId = searchParams.get("jobId") || searchParams.get("id") || ""

  return <MimakiJobDetailView machineId={machineId} jobId={jobId} />
}

export default function MimakiJobPage() {
  return (
    <Suspense fallback={<LoadingState label="Carregando detalhes do job Mimaki..." />}>
      <MimakiJobPageContent />
    </Suspense>
  )
}
