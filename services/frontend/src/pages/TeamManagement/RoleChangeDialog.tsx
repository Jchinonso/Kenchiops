import type { RoleChangeDialogProps } from "./types";
import { cn } from "@/lib/utils";
import { titleCase } from "@/lib/formatters";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

export const RoleChangeDialog = ({
  roleDialogTarget,
  selectedRole,
  onRoleChange,
  assignableRoles,
  isChangingRole,
  onClose,
  onConfirm,
}: RoleChangeDialogProps) => (
  <AlertDialog
    open={roleDialogTarget !== null}
    onOpenChange={(open) => {
      if (!open) {
        onClose();
      }
    }}
  >
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Change Role</AlertDialogTitle>
        <AlertDialogDescription>
          Change the role for{" "}
          <strong className="text-zinc-900 dark:text-zinc-100">
            {roleDialogTarget?.displayName}
          </strong>
          . This will update their permissions within the organization.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <div className="py-2">
        <Select value={selectedRole} onValueChange={onRoleChange}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select a role" />
          </SelectTrigger>
          <SelectContent>
            {assignableRoles.map((role) => (
              <SelectItem key={role} value={role}>
                {titleCase(role)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction
          disabled={isChangingRole || !selectedRole || selectedRole === roleDialogTarget?.role}
          onClick={(event) => {
            event.preventDefault();
            void onConfirm();
          }}
          className={cn(
            selectedRole && selectedRole !== roleDialogTarget?.role && !isChangingRole
              ? "bg-indigo-600 text-white hover:bg-indigo-700"
              : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500 cursor-not-allowed pointer-events-none"
          )}
        >
          {isChangingRole ? "Updating..." : "Update Role"}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
