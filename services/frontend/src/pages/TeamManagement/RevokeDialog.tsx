import type { RevokeDialogProps } from "./types";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

export const RevokeDialog = ({
  revokeTarget,
  isRevoking,
  onClose,
  onConfirm,
}: RevokeDialogProps) => (
  <AlertDialog
    open={revokeTarget !== null}
    onOpenChange={(open) => {
      if (!open) {
        onClose();
      }
    }}
  >
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Revoke Invitation</AlertDialogTitle>
        <AlertDialogDescription>
          Are you sure you want to revoke the invitation for{" "}
          <strong className="text-zinc-900 dark:text-zinc-100">{revokeTarget?.email}</strong>? They
          will no longer be able to join the organization with this invitation.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction
          disabled={isRevoking}
          onClick={(event) => {
            event.preventDefault();
            void onConfirm();
          }}
          className={cn(
            !isRevoking
              ? "bg-red-600 text-white hover:bg-red-700"
              : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500 cursor-not-allowed pointer-events-none"
          )}
        >
          {isRevoking ? "Revoking..." : "Revoke Invitation"}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
