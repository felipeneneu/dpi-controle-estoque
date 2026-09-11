import * as React from "react"

import { cn } from "@/lib/utils"

function Field({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="field" className={cn("flex flex-col gap-2", className)} {...props} />
}

function FieldLabel({ className, htmlFor, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      htmlFor={htmlFor}
      data-slot="field-label"
      className={cn(
        "text-xs font-bold tracking-wider text-muted-foreground uppercase",
        className
      )}
      {...props}
    />
  )
}

function FieldDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="field-description"
      className={cn("text-xs text-muted-foreground", className)}
      {...props}
    />
  )
}

function toErrorString(e: unknown): string | null {
  if (typeof e === "string") return e
  if (e && typeof e === "object") {
    const rec = e as { message?: unknown }
    if (typeof rec.message === "string") return rec.message
  }
  return null
}

function FieldError({
  className,
  errors,
  ...props
}: React.ComponentProps<"p"> & { errors?: ReadonlyArray<unknown> }) {
  const messages = errors?.map(toErrorString).filter((e): e is string => Boolean(e))
  if (!messages || messages.length === 0) return null
  return (
    <p
      data-slot="field-error"
      className={cn("text-xs font-medium text-destructive", className)}
      {...props}
    >
      {messages.join(" · ")}
    </p>
  )
}

function FieldGroup({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="field-group" className={cn("flex flex-col gap-4", className)} {...props} />
}

export { Field, FieldLabel, FieldDescription, FieldError, FieldGroup }