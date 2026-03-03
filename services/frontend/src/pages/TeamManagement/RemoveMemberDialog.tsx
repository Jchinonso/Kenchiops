import type { RemoveMemberDialogProps } from "./types";
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

export const RemoveMemberDialog = ({
  removeDialogTarget,
  isRemoving,
  onClose,
  onConfirm,
}: RemoveMemberDialogProps) => (
  <AlertDialog
    open={removeDialogTarget !== null}
    onOpenChange={(open) => {
      if (!open) {
        onClose();
      }
    }}
  >
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Remove Member</AlertDialogTitle>
        <AlertDialogDescription>
          Are you sure you want to remove{" "}
          <strong className="text-zinc-900 dark:text-zinc-100">
            {removeDialogTarget?.displayName}
          </strong>{" "}
          from the organization? They will lose access to all organization resources.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction
          disabled={isRemoving}
          onClick={(event) => {
            event.preventDefault();
            void onConfirm();
          }}
          className={cn(
            !isRemoving
              ? "bg-red-600 text-white hover:bg-red-700"
              : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500 cursor-not-allowed pointer-events-none"
          )}
        >
          {isRemoving ? "Removing..." : "Remove Member"}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
