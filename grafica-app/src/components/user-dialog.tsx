"use client";

import * as React from "react";
import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import AvatarPicker from "@/components/avatar-picker";
import { useCreateUser, useUpdateUser, useUserPhotos } from "@/lib/queries/users";
import { setUser as persistUser, getUser, type UserRow } from "@/lib/api";

const ROLE_LABEL: Record<string, string> = {
  DEV_MASTER: "Dev Master",
  ADMIN: "Admin",
  OPERATOR: "Operador",
};

const ROLE_OPTIONS = ["OPERATOR", "ADMIN", "DEV_MASTER"] as const;

export type UserDialogMode = { kind: "create" } | { kind: "edit"; user: UserRow };

type Props = {
  mode: UserDialogMode | null;
  onClose: () => void;
  canManageRole: boolean;
  noAvatar?: boolean;
};

function buildZodSchema({ isEdit }: { isEdit: boolean }) {
  return z
    .object({
      name: z.string().min(1, "Informe o nome"),
      email: z.string().min(1, "Informe o e-mail").email("E-mail inválido"),
      password: z.string(),
      role: z.string(),
      avatar: z.string().nullable(),
    })
    .superRefine((v, ctx) => {
      if (!isEdit && v.password.length < 6) {
        ctx.addIssue({
          code: "custom",
          path: ["password"],
          message: "A senha deve ter ao menos 6 caracteres",
        });
      }
    });
}

export default function UserDialog({ mode, onClose, canManageRole }: Props) {
  const photosQuery = useUserPhotos();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const photos = photosQuery.data ?? [];
  const [submitError, setSubmitError] = useState<string | null>(null);

  const isEdit = mode?.kind === "edit";
  const editingUser = mode?.kind === "edit" ? mode.user : null;

  const form = useForm({
    defaultValues: {
      name: editingUser?.name ?? "",
      email: editingUser?.email ?? "",
      password: "",
      role: editingUser?.role ?? "OPERATOR",
      avatar: editingUser?.avatar ?? null,
    },
    validators: {
      onChangeAsync: buildZodSchema({ isEdit }),
      onChangeAsyncDebounceMs: 200,
    },
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      if (isEdit && editingUser) {
        try {
          await updateUser.mutateAsync({
            id: editingUser.id,
            name: value.name,
            email: value.email,
            avatar: value.avatar,
            role: canManageRole ? value.role : editingUser.role,
            ...(value.password ? { password: value.password } : {}),
          });
          const current = getUser();
          if (isEdit && editingUser && current && editingUser.id === current.id) {
            persistUser({
              id: current.id,
              name: value.name,
              email: value.email,
              role: canManageRole ? value.role : current.role,
              avatar: value.avatar,
            });
          }
          toast.success("Usuário atualizado");
        } catch (err) {
          setSubmitError(err instanceof Error ? err.message : "Falha ao atualizar usuário");
          toast.error("Falha ao atualizar usuário");
          return;
        }
      } else {
        try {
          await createUser.mutateAsync({
            name: value.name,
            email: value.email,
            password: value.password,
            role: value.role,
            avatar: value.avatar,
          });
          toast.success("Usuário criado");
        } catch (err) {
          setSubmitError(err instanceof Error ? err.message : "Falha ao criar usuário");
          toast.error("Falha ao criar usuário");
          return;
        }
      }
      onClose();
    },
  });

  return (
    <Dialog open={!!mode} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[82vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Usuário" : "Novo Usuário"}</DialogTitle>
          <DialogDescription>{isEdit ? "Ajuste os dados do acesso" : "Crie um acesso com perfil definido"}</DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void form.handleSubmit();
          }}
          className="space-y-4"
        >
          <form.Field name="name">
            {(field) => (
              <Field>
                <FieldLabel>Nome *</FieldLabel>
                <Input
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  aria-invalid={
                    field.state.meta.isTouched && field.state.meta.errors.length > 0 ? true : undefined
                  }
                  className="h-11 rounded-xl"
                />
                <FieldError errors={field.state.meta.isTouched ? field.state.meta.errors : []} />
              </Field>
            )}
          </form.Field>

          <form.Field name="email">
            {(field) => (
              <Field>
                <FieldLabel>E-mail *</FieldLabel>
                <Input
                  type="email"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  aria-invalid={
                    field.state.meta.isTouched && field.state.meta.errors.length > 0 ? true : undefined
                  }
                  className="h-11 rounded-xl"
                />
                <FieldError errors={field.state.meta.isTouched ? field.state.meta.errors : []} />
              </Field>
            )}
          </form.Field>

          <form.Field name="password">
            {(field) => (
              <Field>
                <FieldLabel>{isEdit ? "Nova senha (opcional)" : "Senha *"}</FieldLabel>
                <Input
                  type="password"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  placeholder={isEdit ? "Deixe vazio para manter" : undefined}
                  aria-invalid={
                    field.state.meta.isTouched && field.state.meta.errors.length > 0 ? true : undefined
                  }
                  className="h-11 rounded-xl"
                />
                <FieldError errors={field.state.meta.isTouched ? field.state.meta.errors : []} />
              </Field>
            )}
          </form.Field>

          {(!isEdit || canManageRole) && (
            <form.Field name="role">
              {(field) => (
                <div className="space-y-2">
                  <FieldLabel>Perfil</FieldLabel>
                  <select
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    className="h-11 w-full rounded-xl border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </form.Field>
          )}

          <div className="space-y-2">
            <FieldLabel>Foto (arquivos em /public/users)</FieldLabel>
            <form.Field name="avatar">
              {(field) => (
                <AvatarPicker value={field.state.value} onChange={field.handleChange} photos={photos} />
              )}
            </form.Field>
          </div>

          {submitError && (
            <p className="text-sm font-semibold text-destructive" role="alert">
              {submitError}
            </p>
          )}

          <DialogFooter>
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <>
                  <Button type="button" variant="outline" onClick={onClose}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? <Spinner className="size-4" /> : null}
                    {isSubmitting ? "Salvando…" : "Salvar"}
                  </Button>
                </>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}